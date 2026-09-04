import { AudioEngine } from "../audio/AudioEngine";
import { MicTurnDetector } from "../audio/MicTurnDetector";
import { GeminiLiveAdapter } from "../gemini/GeminiLiveAdapter";
import { DEFAULT_VOICE_NAME, isGemini25LiveModel } from "../gemini/catalog";
import { nextPhase } from "../session/sessionMachine";
import type { ConversationPhase, EmotionId, ProviderEvent } from "../types";
import { mergeStreamingTranscript } from "./transcript";
import {
  GEMINI25_AUDIO_IDLE_COMMIT_MS,
  GEMINI25_MAX_COMPLETION_REPAIRS,
  looksLikePrematureCutoff,
} from "./responseCompletion";

const MAX_AUTO_RECONNECT_ATTEMPTS = 3;
const RECONNECT_STABILITY_MS = 5000;
const THINKING_RESPONSE_TIMEOUT_MS = 10000;
const TURN_COMPLETE_GRACE_MS = 240;
const PLAYBACK_TAIL_GUARD_MS = 40;
const MIC_HEALTH_CHECK_MS = 850;
const MAX_MIC_PIPELINE_RECOVERIES = 3;
const MIC_RECOVERY_COOLDOWN_MS = 2500;
const RECONNECT_BACKOFF_MS = [350, 900, 1800] as const;

export interface ConversationSnapshot {
  phase: ConversationPhase;
  inputTranscript: string;
  outputTranscript: string;
  error?: string;
  resumed: boolean;
  reconnectCount: number;
}

export interface ConversationDependencies {
  audio?: AudioEngine;
  provider?: GeminiLiveAdapter;
  micTurnDetector?: MicTurnDetector;
}

export class ConversationCoordinator {
  readonly audio: AudioEngine;
  readonly provider: GeminiLiveAdapter;
  private readonly micTurnDetector: MicTurnDetector;
  private snapshot: ConversationSnapshot = { phase: "disconnected", inputTranscript: "", outputTranscript: "", resumed: false, reconnectCount: 0 };
  private listeners = new Set<(value: ConversationSnapshot) => void>();
  private expressionListener?: (emotion: EmotionId, intensity: number) => void;
  private characterId = "greus-greeny";
  private voiceName = DEFAULT_VOICE_NAME;
  private modelId = "gemini-3.1-flash-live-preview";
  private generationComplete = false;
  private playbackEpoch = 0;
  private reconnecting = false;
  private reconnectPromise?: Promise<void>;
  private desiredListening = false;
  private microphoneDeviceId = "default";
  private lastEmotion: EmotionId = "idle";
  private lastEmotionIntensity = 1;
  private disposed = false;
  private inputTranscriptOpen = false;
  private outputTranscriptOpen = false;
  private reconnectTimer?: number;
  private reconnectStabilityTimer?: number;
  private thinkingResponseTimer?: number;
  private audioIdleCommitTimer?: number;
  private turnFinalizeTimer?: number;
  private micHealthTimer?: number;
  private autoReconnectAttempts = 0;
  private micPipelineRecoveries = 0;
  private capturePauseForPlayback?: Promise<void>;
  private completionRepairAttempts = 0;
  private providerEventQueue: Promise<void> = Promise.resolve();
  private pendingText?: { text: string; replayed: boolean };

  constructor(dependencies: ConversationDependencies = {}) {
    this.audio = dependencies.audio ?? new AudioEngine();
    this.provider = dependencies.provider ?? new GeminiLiveAdapter();
    this.micTurnDetector = dependencies.micTurnDetector ?? new MicTurnDetector();
    this.provider.onEvent((event) => this.enqueueProviderEvent(event));
    this.audio.onCapturePcm = (chunk) => {
      if (!this.provider.isReady) {
        this.handleMicTransportFailure("Gemini Live 연결이 끊겨 마이크 전송을 잠시 멈췄습니다. 자동 재연결 중입니다.");
        return;
      }
      try {
        this.provider.sendPcm16(chunk);
      } catch (error) {
        const message = error instanceof Error ? error.message : "마이크 데이터를 전송하지 못했습니다.";
        this.handleMicTransportFailure(`마이크 전송 오류: ${message}`);
        return;
      }
      const signal = this.micTurnDetector.feed(chunk);
      if (signal === "speech-start") {
        this.clearThinkingResponseTimer();
        return;
      }
    };
    this.audio.onPlaybackStart = () => {
      this.clearThinkingResponseTimer();
      this.clearMicHealthTimer();
      this.audio.gate.setSpeaking(true);
      this.micTurnDetector.reset();
      if (this.snapshot.phase !== "speaking") this.transition("MODEL_AUDIO_START");
    };
  }

  subscribe(listener: (value: ConversationSnapshot) => void): () => void { this.listeners.add(listener); listener(this.snapshot); return () => this.listeners.delete(listener); }
  onExpression(listener: (emotion: EmotionId, intensity: number) => void): void { this.expressionListener = listener; }
  resetExpression(): void { this.lastEmotion = "idle"; this.lastEmotionIntensity = 1; this.expressionListener?.("idle", 1); }

  async changeMicrophoneDevice(deviceId: string): Promise<void> {
    this.microphoneDeviceId = deviceId;
    this.micTurnDetector.reset();
    this.micPipelineRecoveries = 0;
    if (this.desiredListening) {
      await this.audio.forceRestartCapture(deviceId);
      this.audio.gate.setSpeaking(false);
      this.audio.gate.open();
      this.armMicHealthCheck();
    }
  }
  private update(patch: Partial<ConversationSnapshot>): void { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach((listener) => listener(this.snapshot)); }
  private transition(event: Parameters<typeof nextPhase>[1]): void { this.update({ phase: nextPhase(this.snapshot.phase, event) }); }
  private beginUserTurn(): void { this.playbackEpoch += 1; this.completionRepairAttempts = 0; this.generationComplete = false; this.clearAudioIdleCommitTimer(); this.clearTurnFinalizeTimer(); }

  private clearReconnectTimer(): void { if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined; }
  private clearReconnectStabilityTimer(): void { if (this.reconnectStabilityTimer !== undefined) window.clearTimeout(this.reconnectStabilityTimer); this.reconnectStabilityTimer = undefined; }
  private clearThinkingResponseTimer(): void { if (this.thinkingResponseTimer !== undefined) window.clearTimeout(this.thinkingResponseTimer); this.thinkingResponseTimer = undefined; }
  private clearAudioIdleCommitTimer(): void { if (this.audioIdleCommitTimer !== undefined) window.clearTimeout(this.audioIdleCommitTimer); this.audioIdleCommitTimer = undefined; }
  private clearTurnFinalizeTimer(): void { if (this.turnFinalizeTimer !== undefined) window.clearTimeout(this.turnFinalizeTimer); this.turnFinalizeTimer = undefined; }
  private clearMicHealthTimer(): void { if (this.micHealthTimer !== undefined) window.clearTimeout(this.micHealthTimer); this.micHealthTimer = undefined; }

  private enqueueProviderEvent(event: ProviderEvent): void {
    this.providerEventQueue = this.providerEventQueue
      .then(() => this.handleProviderEvent(event))
      .catch((error) => this.recoverFromAudioPipelineFailure(error));
  }

  private runAudioTask(task: Promise<void>): void {
    void task.catch((error) => this.recoverFromAudioPipelineFailure(error));
  }

  private logTransport(event: string, detail: Record<string, unknown> = {}): void {
    console.info("[deskpet:live]", {
      event,
      phase: this.snapshot.phase,
      reconnectCount: this.snapshot.reconnectCount,
      ...detail,
    });
  }

  private handleMicTransportFailure(message: string): void {
    if (this.disposed || !this.desiredListening || ["disconnected", "error", "connecting", "reconnecting"].includes(this.snapshot.phase)) return;
    this.logTransport("microphone-transport-lost");
    this.clearThinkingResponseTimer(); this.clearMicHealthTimer(); this.audio.gate.close();
    this.transition("RECONNECT"); this.update({ error: message });
    this.scheduleReconnect("network", 80);
  }

  private async recoverFromAudioPipelineFailure(error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : "오디오 처리 중 알 수 없는 오류가 발생했습니다.";
    this.clearThinkingResponseTimer(); this.clearAudioIdleCommitTimer(); this.clearTurnFinalizeTimer(); this.clearMicHealthTimer();
    this.capturePauseForPlayback = undefined; this.generationComplete = false; this.playbackEpoch += 1;
    this.audio.flushPlayback(); this.audio.gate.setSpeaking(false);
    try {
      await this.reopenListening();
      this.update({ error: `오디오 파이프라인을 복구했습니다: ${message}` });
    } catch (recoveryError) {
      const recoveryMessage = recoveryError instanceof Error ? recoveryError.message : message;
      this.failRecovery(`오디오 파이프라인 복구 실패: ${recoveryMessage}`);
    }
  }

  private armMicHealthCheck(delayMs = MIC_HEALTH_CHECK_MS): void {
    this.clearMicHealthTimer();
    if (!this.desiredListening || this.snapshot.phase !== "listening") return;
    this.micHealthTimer = window.setTimeout(() => {
      this.micHealthTimer = undefined;
      if (this.disposed || !this.desiredListening || this.snapshot.phase !== "listening") return;
      if (this.audio.captureHeartbeatFresh && this.audio.forwardedMicHeartbeatFresh) {
        this.micPipelineRecoveries = 0;
        this.armMicHealthCheck();
        return;
      }

      if (this.micPipelineRecoveries >= MAX_MIC_PIPELINE_RECOVERIES) {
        this.logTransport("microphone-recovery-cooldown", this.audio.captureDiagnostics());
        this.micPipelineRecoveries = 0;
        this.update({ error: "마이크 입력이 잠시 멈춰 자동 복구를 계속 시도하고 있습니다." });
        this.armMicHealthCheck(MIC_RECOVERY_COOLDOWN_MS);
        return;
      }

      this.micPipelineRecoveries += 1;
      this.logTransport("microphone-pipeline-restart", {
        attempt: this.micPipelineRecoveries,
        ...this.audio.captureDiagnostics(),
      });
      this.audio.gate.close();
      this.provider.endInputAudio();
      void this.audio.forceRestartCapture(this.microphoneDeviceId).then(() => {
        if (this.disposed || !this.desiredListening || this.snapshot.phase !== "listening") return;
        this.micTurnDetector.reset();
        this.audio.gate.setSpeaking(false);
        this.audio.gate.open();
        this.update({ error: undefined });
        this.armMicHealthCheck();
      }).catch((error) => {
        this.update({ error: error instanceof Error ? `마이크 자동 복구 실패: ${error.message}` : "마이크 자동 복구에 실패했습니다." });
        this.armMicHealthCheck();
      });
    }, delayMs);
  }

  private armAudioIdleCommitTimer(epoch: number): void {
    this.clearAudioIdleCommitTimer();
    if (!isGemini25LiveModel(this.modelId)) return;
    this.audioIdleCommitTimer = window.setTimeout(() => {
      this.audioIdleCommitTimer = undefined;
      if (this.disposed || epoch !== this.playbackEpoch || this.snapshot.phase !== "speaking" || this.generationComplete) return;
      this.generationComplete = true;
      this.runAudioTask(this.commitPlaybackAndFinish(epoch));
    }, GEMINI25_AUDIO_IDLE_COMMIT_MS);
  }

  private armTurnFinalizeFallback(epoch: number): void {
    this.clearTurnFinalizeTimer();
    this.turnFinalizeTimer = window.setTimeout(() => {
      this.turnFinalizeTimer = undefined;
      if (this.disposed || epoch !== this.playbackEpoch || !this.generationComplete) return;
      this.runAudioTask(this.finishSpeakingWhenDrained(epoch));
    }, TURN_COMPLETE_GRACE_MS);
  }

  private armThinkingResponseTimer(): void {
    this.clearThinkingResponseTimer();
    this.thinkingResponseTimer = window.setTimeout(() => {
      this.thinkingResponseTimer = undefined;
      if (this.disposed || this.snapshot.phase !== "thinking") return;
      this.pendingText = undefined;
      this.generationComplete = false;
      this.audio.flushPlayback();
      this.audio.gate.setSpeaking(false);
      if (this.desiredListening) {
        void this.restoreListeningCapture().then(() => {
          if (this.disposed || this.snapshot.phase !== "thinking") return;
          this.audio.gate.open();
          this.update({ phase: "listening", error: "Gemini 응답이 지연되어 다시 듣기 상태로 복구했습니다." });
          this.armMicHealthCheck();
        });
      } else {
        this.capturePauseForPlayback = undefined;
        this.update({ phase: "idle", error: "Gemini 응답이 지연되어 대기 상태로 복구했습니다." });
      }
    }, THINKING_RESPONSE_TIMEOUT_MS);
  }

  private markConnectionStable(): void {
    this.clearReconnectStabilityTimer();
    this.reconnectStabilityTimer = window.setTimeout(() => {
      this.reconnectStabilityTimer = undefined;
      if (this.provider.isReady && !["error", "disconnected", "reconnecting"].includes(this.snapshot.phase)) this.autoReconnectAttempts = 0;
    }, RECONNECT_STABILITY_MS);
  }
  private markProviderActivity(): void { this.autoReconnectAttempts = 0; this.clearReconnectStabilityTimer(); }

  private failRecovery(message = "Gemini Live 연결을 복구하지 못했습니다. API 키를 확인한 뒤 다시 연결해 주세요."): void {
    this.clearReconnectTimer(); this.clearReconnectStabilityTimer(); this.clearThinkingResponseTimer(); this.clearAudioIdleCommitTimer(); this.clearTurnFinalizeTimer(); this.clearMicHealthTimer();
    this.pendingText = undefined; this.reconnecting = false; this.transition("FAIL"); this.update({ error: message });
  }

  private async enterPlaybackMode(): Promise<void> {
    if (!this.capturePauseForPlayback) {
      this.clearMicHealthTimer();
      this.audio.gate.close();
      this.provider.endInputAudio();
      const pause = this.audio.pauseCaptureForPlayback();
      this.capturePauseForPlayback = pause;
      try {
        await pause;
      } catch (error) {
        if (this.capturePauseForPlayback === pause) this.capturePauseForPlayback = undefined;
        throw error;
      }
      return;
    }
    await this.capturePauseForPlayback;
  }

  private async restoreListeningCapture(): Promise<void> {
    try {
      if (this.capturePauseForPlayback) await this.capturePauseForPlayback;
      if (this.desiredListening) await this.audio.resumeCaptureForListening(this.microphoneDeviceId);
    } finally {
      this.capturePauseForPlayback = undefined;
    }
  }

  private async reopenListening(): Promise<void> {
    if (!this.desiredListening) {
      this.capturePauseForPlayback = undefined;
      this.update({ phase: "idle" });
      return;
    }
    await this.restoreListeningCapture();
    this.micTurnDetector.reset();
    this.audio.gate.setSpeaking(false);
    this.audio.gate.open();
    this.update({ phase: "listening", error: undefined });
    this.armMicHealthCheck();
  }

  async connect(characterId: string, voiceName: string, modelId: string): Promise<void> {
    this.disposed = false; this.characterId = characterId; this.voiceName = voiceName; this.modelId = modelId;
    this.clearReconnectTimer(); this.clearReconnectStabilityTimer(); this.clearThinkingResponseTimer(); this.clearAudioIdleCommitTimer(); this.clearTurnFinalizeTimer(); this.clearMicHealthTimer(); this.autoReconnectAttempts = 0; this.micPipelineRecoveries = 0; this.reconnecting = false;
    this.transition(this.snapshot.phase === "error" ? "RETRY" : "CONNECT"); this.update({ error: undefined });
    this.logTransport("connect-start", { modelId });
    try {
      await this.audio.preparePlayback(); await this.audio.unlockPlayback(); await this.provider.connect(characterId, voiceName, modelId);
      await this.providerEventQueue;
      this.logTransport("connect-ready", { modelId });
    }
    catch (error) {
      const message = error instanceof Error ? error.message : "연결할 수 없습니다.";
      this.logTransport("connect-failed", { message }); this.transition("FAIL"); this.update({ error: message }); throw error;
    }
  }

  async startListening(deviceId = "default"): Promise<void> {
    if (this.snapshot.phase === "disconnected" || this.snapshot.phase === "error") throw new Error("먼저 Live 연결을 시작해 주세요.");
    if (!this.provider.isReady) {
      await this.reconnect("network");
      if (!this.provider.isReady) throw new Error("Live 연결을 복구하지 못했습니다. 다시 연결해 주세요.");
    }
    this.clearThinkingResponseTimer();
    this.desiredListening = true; this.microphoneDeviceId = deviceId; this.capturePauseForPlayback = undefined; this.micPipelineRecoveries = 0; this.micTurnDetector.reset();
    await this.audio.startCapture(deviceId); this.audio.gate.setSpeaking(false); this.audio.gate.open(); this.transition("START_LISTENING"); this.armMicHealthCheck();
  }

  stopListening(): void {
    this.desiredListening = false; this.clearMicHealthTimer(); this.micTurnDetector.reset(); this.audio.gate.close(); this.provider.endInputAudio(); void this.audio.stopCapture(); this.transition("USER_SPEECH_END");
    this.armThinkingResponseTimer();
  }

  async sendText(text: string): Promise<void> {
    const value = text.trim(); if (!value) return;
    if (this.snapshot.phase === "disconnected" || this.snapshot.phase === "error") {
      await this.connect(this.characterId, this.voiceName, this.modelId);
    }
    if (this.reconnectPromise) await this.reconnectPromise;
    await this.providerEventQueue;
    if (this.snapshot.phase === "connecting" || this.snapshot.phase === "reconnecting") throw new Error("Live 연결이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.");
    if (!this.provider.isReady) {
      await this.reconnect("network");
      if (!this.provider.isReady) throw new Error("Live 연결을 복구하지 못했습니다. 다시 연결해 주세요.");
    }
    this.beginUserTurn(); this.clearMicHealthTimer(); this.audio.gate.close(); this.audio.gate.setSpeaking(false); this.audio.flushPlayback();
    if (this.desiredListening) this.provider.endInputAudio();
    this.capturePauseForPlayback = undefined; this.inputTranscriptOpen = true; this.outputTranscriptOpen = false;
    try {
      this.provider.sendText(value);
    } catch {
      this.logTransport("text-send-race-retry");
      await this.reconnect("network");
      if (!this.provider.isReady) throw new Error("메시지 전송 중 Live 연결이 끊겼고 자동 복구하지 못했습니다.");
      try { this.provider.sendText(value); }
      catch (error) {
        const detail = error instanceof Error ? error.message : "알 수 없는 전송 오류";
        this.update({ error: `Live 연결은 복구됐지만 메시지를 전송하지 못했습니다: ${detail}` });
        throw error;
      }
    }
    this.pendingText = { text: value, replayed: false };
    this.update({ phase: "thinking", inputTranscript: value, outputTranscript: "", error: undefined }); this.armThinkingResponseTimer();
  }

  async changeVoice(voiceName: string): Promise<void> { if (this.voiceName === voiceName) return; this.voiceName = voiceName; if (this.snapshot.phase !== "disconnected") await this.reconnect("voice-change"); }
  async changeModel(modelId: string): Promise<void> { if (this.modelId === modelId) return; this.modelId = modelId; if (this.snapshot.phase !== "disconnected") await this.reconnect("model-change"); }

  async switchCharacter(characterId: string, voiceName: string, modelId: string): Promise<void> {
    this.characterId = characterId; this.voiceName = voiceName; this.modelId = modelId; this.audio.gate.close(); this.audio.flushPlayback(); this.desiredListening = false;
    this.clearReconnectTimer(); this.clearReconnectStabilityTimer(); this.clearThinkingResponseTimer(); this.clearAudioIdleCommitTimer(); this.clearTurnFinalizeTimer(); this.clearMicHealthTimer(); this.autoReconnectAttempts = 0; this.reconnecting = false;
    this.micTurnDetector.reset(); this.lastEmotion = "idle"; this.lastEmotionIntensity = 1; await this.audio.stopCapture(); this.capturePauseForPlayback = undefined; await this.provider.close();
    this.update({ phase: "disconnected", inputTranscript: "", outputTranscript: "", resumed: false, error: undefined });
  }

  private reconnect(reason: "voice-change" | "model-change" | "go-away" | "network"): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.reconnectPromise) return this.reconnectPromise;
    const task = this.performReconnect(reason).finally(() => {
      if (this.reconnectPromise === task) this.reconnectPromise = undefined;
    });
    this.reconnectPromise = task;
    return task;
  }

  private async performReconnect(reason: "voice-change" | "model-change" | "go-away" | "network"): Promise<void> {
    this.clearThinkingResponseTimer(); this.clearAudioIdleCommitTimer(); this.clearTurnFinalizeTimer(); this.clearMicHealthTimer();
    const automatic = reason === "network" || reason === "go-away";
    if (automatic && this.autoReconnectAttempts >= MAX_AUTO_RECONNECT_ATTEMPTS) { this.failRecovery(); return; }
    this.reconnecting = true; this.transition("RECONNECT"); this.audio.gate.close(); this.audio.gate.setSpeaking(false); this.provider.endInputAudio(); this.audio.flushPlayback(); this.generationComplete = false; this.playbackEpoch += 1;
    let lastError = "재연결하지 못했습니다.";
    try {
      do {
        if (automatic) this.autoReconnectAttempts += 1;
        const attempt = automatic ? this.autoReconnectAttempts : 1;
        try {
          this.logTransport("reconnect-attempt", { reason, attempt, maxAttempts: automatic ? MAX_AUTO_RECONNECT_ATTEMPTS : 1 });
          await this.provider.close();
          const delayMs = reason === "network" ? RECONNECT_BACKOFF_MS[Math.min(attempt - 1, RECONNECT_BACKOFF_MS.length - 1)] : 0;
          if (delayMs > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
          if (this.disposed) return;
          await this.provider.connect(this.characterId, this.voiceName, this.modelId);
          await this.providerEventQueue;
          if (!this.provider.isReady) throw new Error("재연결 직후 Live 세션이 준비되지 않았습니다.");
          if (this.pendingText && !this.pendingText.replayed) {
            this.audio.gate.close();
            if (this.desiredListening) this.provider.endInputAudio();
            this.provider.sendText(this.pendingText.text);
            this.pendingText.replayed = true;
            this.update({ phase: "thinking", error: undefined });
            this.armThinkingResponseTimer();
          }
          this.autoReconnectAttempts = 0;
          this.update({ reconnectCount: this.snapshot.reconnectCount + 1, error: undefined });
          this.logTransport("reconnect-ready", { reason, attempt });
          return;
        } catch (error) {
          lastError = error instanceof Error ? error.message : "재연결하지 못했습니다.";
          this.logTransport("reconnect-attempt-failed", { reason, attempt, message: lastError });
          if (!automatic || this.autoReconnectAttempts >= MAX_AUTO_RECONNECT_ATTEMPTS) break;
          this.update({ phase: "reconnecting", error: `Live 재연결 ${this.autoReconnectAttempts}/${MAX_AUTO_RECONNECT_ATTEMPTS} 실패 · 자동으로 다시 시도합니다.` });
        }
      } while (automatic && this.autoReconnectAttempts < MAX_AUTO_RECONNECT_ATTEMPTS);
      this.failRecovery(lastError);
    } finally { this.reconnecting = false; }
  }

  private scheduleReconnect(reason: "go-away" | "network", delayMs = 120): void {
    if (this.disposed || ["disconnected", "error"].includes(this.snapshot.phase)) return;
    if (this.autoReconnectAttempts >= MAX_AUTO_RECONNECT_ATTEMPTS) { this.failRecovery(); return; }
    this.clearReconnectTimer();
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.disposed || ["disconnected", "error"].includes(this.snapshot.phase)) return;
      if (this.reconnecting) { this.scheduleReconnect(reason, 350); return; }
      void this.reconnect(reason);
    }, delayMs);
  }

  private async commitPlaybackAndFinish(epoch: number): Promise<void> {
    await this.audio.commitBufferedPlayback();
    this.runAudioTask(this.finishSpeakingWhenDrained(epoch));
  }

  private async settleWaitingForInput(): Promise<void> {
    this.clearThinkingResponseTimer(); this.clearAudioIdleCommitTimer(); this.clearTurnFinalizeTimer();
    if (!this.audio.queueEmpty || this.snapshot.phase === "speaking") {
      this.generationComplete = true;
      await this.commitPlaybackAndFinish(this.playbackEpoch);
      return;
    }
    this.generationComplete = false;
    await this.reopenListening();
  }

  private async repairPrematureGemini25Turn(epoch: number): Promise<boolean> {
    if (!isGemini25LiveModel(this.modelId)) return false;
    if (this.completionRepairAttempts >= GEMINI25_MAX_COMPLETION_REPAIRS) return false;
    if (!looksLikePrematureCutoff(this.snapshot.outputTranscript)) return false;
    this.completionRepairAttempts += 1;
    this.clearAudioIdleCommitTimer(); this.clearTurnFinalizeTimer();
    this.generationComplete = true;
    await this.audio.commitBufferedPlayback();
    await this.audio.waitForDrain(PLAYBACK_TAIL_GUARD_MS);
    if (this.disposed || epoch !== this.playbackEpoch || !this.provider.isReady) return true;
    this.generationComplete = false; this.audio.gate.setSpeaking(false); this.audio.gate.close();
    this.update({ phase: "thinking", error: undefined });
    this.provider.sendContinuationRecovery();
    this.armThinkingResponseTimer();
    return true;
  }

  private async handleProviderEvent(event: ProviderEvent): Promise<void> {
    switch (event.type) {
      case "connected":
        this.update({ phase: this.desiredListening ? "listening" : this.snapshot.phase === "reconnecting" ? "idle" : nextPhase(this.snapshot.phase, "CONNECTED"), resumed: event.resumed, error: undefined });
        this.markConnectionStable();
        if (this.desiredListening) { await this.restoreListeningCapture(); this.audio.gate.setSpeaking(false); this.audio.gate.open(); this.armMicHealthCheck(); }
        this.expressionListener?.(this.lastEmotion, this.lastEmotionIntensity); break;
      case "audio":
        this.pendingText = undefined;
        this.clearThinkingResponseTimer(); this.markProviderActivity(); this.generationComplete = false;
        await this.enterPlaybackMode(); await this.audio.enqueuePcm24k(event.pcm); this.armAudioIdleCommitTimer(this.playbackEpoch); break;
      case "generation-complete":
        this.pendingText = undefined;
        this.clearThinkingResponseTimer(); this.clearAudioIdleCommitTimer(); this.markProviderActivity(); this.generationComplete = true;
        await this.audio.commitBufferedPlayback(); this.armTurnFinalizeFallback(this.playbackEpoch); break;
      case "turn-complete": {
        this.pendingText = undefined;
        this.clearThinkingResponseTimer(); this.clearAudioIdleCommitTimer(); this.clearTurnFinalizeTimer(); this.markProviderActivity(); this.generationComplete = true; this.inputTranscriptOpen = false;
        const epoch = this.playbackEpoch;
        if (await this.repairPrematureGemini25Turn(epoch)) break;
        await this.commitPlaybackAndFinish(epoch); break;
      }
      case "waiting-for-input": this.pendingText = undefined; this.markProviderActivity(); await this.settleWaitingForInput(); break;
      case "interrupted":
        this.clearThinkingResponseTimer(); this.clearAudioIdleCommitTimer(); this.clearTurnFinalizeTimer(); this.markProviderActivity(); this.playbackEpoch += 1; this.generationComplete = false; this.audio.flushPlayback(); this.audio.gate.setSpeaking(false);
        await this.reopenListening();
        break;
      case "input-transcript": {
        this.markProviderActivity(); const previous = this.inputTranscriptOpen ? this.snapshot.inputTranscript : "";
        if (!this.inputTranscriptOpen) { this.outputTranscriptOpen = false; this.beginUserTurn(); }
        this.inputTranscriptOpen = true; this.update({ inputTranscript: mergeStreamingTranscript(previous, event.text) }); break;
      }
      case "output-transcript": {
        this.pendingText = undefined;
        this.clearThinkingResponseTimer(); this.markProviderActivity(); const previous = this.outputTranscriptOpen ? this.snapshot.outputTranscript : ""; this.outputTranscriptOpen = true;
        this.update({ outputTranscript: mergeStreamingTranscript(previous, event.text) }); break;
      }
      case "expression": this.markProviderActivity(); this.lastEmotion = event.emotion; this.lastEmotionIntensity = event.intensity; this.expressionListener?.(event.emotion, event.intensity); break;
      case "go-away":
        this.logTransport("provider-go-away", { timeLeftMs: event.timeLeftMs });
        this.clearThinkingResponseTimer(); this.clearAudioIdleCommitTimer(); this.clearTurnFinalizeTimer(); this.clearMicHealthTimer(); this.clearReconnectStabilityTimer();
        if (!this.reconnecting && this.snapshot.phase !== "disconnected" && this.snapshot.phase !== "error") this.transition("RECONNECT");
        this.scheduleReconnect("go-away", Math.max(20, event.timeLeftMs - 1200)); break;
      case "closed":
        this.logTransport("provider-closed", { code: event.code, reason: event.reason });
        this.clearThinkingResponseTimer(); this.clearAudioIdleCommitTimer(); this.clearTurnFinalizeTimer(); this.clearMicHealthTimer(); this.clearReconnectStabilityTimer();
        if (!this.reconnecting && this.snapshot.phase !== "disconnected" && this.snapshot.phase !== "error") this.transition("RECONNECT");
        this.scheduleReconnect("network"); break;
      case "error":
        this.logTransport("provider-error", { message: event.message });
        this.clearThinkingResponseTimer(); this.clearAudioIdleCommitTimer(); this.clearTurnFinalizeTimer(); this.clearMicHealthTimer(); this.clearReconnectStabilityTimer(); this.update({ error: event.message });
        if (!["connecting", "disconnected", "error"].includes(this.snapshot.phase)) {
          if (!this.reconnecting && this.snapshot.phase !== "reconnecting") this.transition("RECONNECT");
          this.scheduleReconnect("network", 450);
        }
        break;
      default: break;
    }
  }

  private async finishSpeakingWhenDrained(epoch: number): Promise<void> {
    await this.audio.waitForDrain(PLAYBACK_TAIL_GUARD_MS);
    if (!this.generationComplete || epoch !== this.playbackEpoch) return;
    this.clearThinkingResponseTimer(); this.clearAudioIdleCommitTimer(); this.clearTurnFinalizeTimer(); this.audio.gate.setSpeaking(false);
    await this.reopenListening();
  }

  diagnostics() {
    return {
      ...this.audio.gate.diagnostics(),
      ...this.audio.captureDiagnostics(),
      ...this.micTurnDetector.diagnostics(),
      phase: this.snapshot.phase,
      reconnectCount: this.snapshot.reconnectCount,
      providerReady: this.provider.isReady,
      autoReconnectAttempts: this.autoReconnectAttempts,
      micPipelineRecoveries: this.micPipelineRecoveries,
    };
  }

  async dispose(): Promise<void> {
    this.disposed = true; this.desiredListening = false; this.pendingText = undefined; this.clearReconnectTimer(); this.clearReconnectStabilityTimer(); this.clearThinkingResponseTimer(); this.clearAudioIdleCommitTimer(); this.clearTurnFinalizeTimer(); this.clearMicHealthTimer(); this.audio.gate.close(); this.provider.endInputAudio(); await this.provider.close(); await this.audio.dispose(); this.capturePauseForPlayback = undefined;
  }
}
