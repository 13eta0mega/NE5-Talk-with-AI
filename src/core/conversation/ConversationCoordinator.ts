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
const MAX_MIC_PIPELINE_RECOVERIES = 2;

export interface ConversationSnapshot {
  phase: ConversationPhase;
  inputTranscript: string;
  outputTranscript: string;
  error?: string;
  resumed: boolean;
  reconnectCount: number;
}

export class ConversationCoordinator {
  readonly audio = new AudioEngine();
  readonly provider = new GeminiLiveAdapter();
  private readonly micTurnDetector = new MicTurnDetector();
  private snapshot: ConversationSnapshot = { phase: "disconnected", inputTranscript: "", outputTranscript: "", resumed: false, reconnectCount: 0 };
  private listeners = new Set<(value: ConversationSnapshot) => void>();
  private expressionListener?: (emotion: EmotionId, intensity: number) => void;
  private characterId = "greus-greeny";
  private voiceName = DEFAULT_VOICE_NAME;
  private modelId = "gemini-3.1-flash-live-preview";
  private generationComplete = false;
  private playbackEpoch = 0;
  private reconnecting = false;
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

  constructor() {
    this.provider.onEvent((event) => void this.handleProviderEvent(event));
    this.audio.onCapturePcm = (chunk) => {
      this.provider.sendPcm16(chunk);
      const signal = this.micTurnDetector.feed(chunk);
      if (signal === "speech-start") {
        this.clearThinkingResponseTimer();
        return;
      }
      if (signal === "speech-end" && this.snapshot.phase === "listening" && this.desiredListening) {
        // Flush Gemini's server-side VAD/audio cache and stop forwarding the following
        // silence. The next listening phase reopens the gate and the next PCM packet
        // automatically reopens the realtime audio stream.
        this.audio.gate.close();
        this.provider.endInputAudio();
        this.transition("USER_SPEECH_END");
        this.armThinkingResponseTimer();
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

  private armMicHealthCheck(): void {
    this.clearMicHealthTimer();
    if (!this.desiredListening || this.snapshot.phase !== "listening") return;
    this.micHealthTimer = window.setTimeout(() => {
      this.micHealthTimer = undefined;
      if (this.disposed || !this.desiredListening || this.snapshot.phase !== "listening") return;
      if (this.audio.captureHeartbeatFresh) {
        this.micPipelineRecoveries = 0;
        return;
      }
      if (this.micPipelineRecoveries >= MAX_MIC_PIPELINE_RECOVERIES) {
        this.update({ error: "마이크 입력 스트림이 멈췄습니다. 마이크 버튼을 다시 눌러 복구해 주세요." });
        return;
      }
      this.micPipelineRecoveries += 1;
      this.audio.gate.close();
      this.provider.endInputAudio();
      void this.audio.forceRestartCapture(this.microphoneDeviceId).then(() => {
        if (this.disposed || !this.desiredListening || this.snapshot.phase !== "listening") return;
        this.micTurnDetector.reset();
        this.audio.gate.setSpeaking(false);
        this.audio.gate.open();
        this.armMicHealthCheck();
      }).catch((error) => {
        this.update({ error: error instanceof Error ? `마이크 자동 복구 실패: ${error.message}` : "마이크 자동 복구에 실패했습니다." });
      });
    }, MIC_HEALTH_CHECK_MS);
  }

  private armAudioIdleCommitTimer(epoch: number): void {
    this.clearAudioIdleCommitTimer();
    if (!isGemini25LiveModel(this.modelId)) return;
    this.audioIdleCommitTimer = window.setTimeout(() => {
      this.audioIdleCommitTimer = undefined;
      if (this.disposed || epoch !== this.playbackEpoch || this.snapshot.phase !== "speaking" || this.generationComplete) return;
      this.generationComplete = true;
      void this.commitPlaybackAndFinish(epoch);
    }, GEMINI25_AUDIO_IDLE_COMMIT_MS);
  }

  private armTurnFinalizeFallback(epoch: number): void {
    this.clearTurnFinalizeTimer();
    this.turnFinalizeTimer = window.setTimeout(() => {
      this.turnFinalizeTimer = undefined;
      if (this.disposed || epoch !== this.playbackEpoch || !this.generationComplete) return;
      void this.finishSpeakingWhenDrained(epoch);
    }, TURN_COMPLETE_GRACE_MS);
  }

  private armThinkingResponseTimer(): void {
    this.clearThinkingResponseTimer();
    this.thinkingResponseTimer = window.setTimeout(() => {
      this.thinkingResponseTimer = undefined;
      if (this.disposed || this.snapshot.phase !== "thinking") return;
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
    this.reconnecting = false; this.transition("FAIL"); this.update({ error: message });
  }

  private async enterPlaybackMode(): Promise<void> {
    if (!this.capturePauseForPlayback) {
      this.clearMicHealthTimer();
      // Playback pauses the outgoing microphone stream for well over one second on
      // normal replies. Explicitly end that realtime stream so Gemini does not retain
      // stale VAD/audio cache across turns.
      this.audio.gate.close();
      this.provider.endInputAudio();
      this.capturePauseForPlayback = this.audio.pauseCaptureForPlayback();
    }
    await this.capturePauseForPlayback;
  }

  private async restoreListeningCapture(): Promise<void> {
    try {
      if (this.capturePauseForPlayback) await this.capturePauseForPlayback;
      if (this.desiredListening && !this.audio.captureActive) await this.audio.startCapture(this.microphoneDeviceId);
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
    try { await this.audio.preparePlayback(); await this.audio.unlockPlayback(); await this.provider.connect(characterId, voiceName, modelId); }
    catch (error) { this.transition("FAIL"); this.update({ error: error instanceof Error ? error.message : "연결할 수 없습니다." }); throw error; }
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
    if (this.snapshot.phase === "disconnected" || this.snapshot.phase === "error") throw new Error("먼저 Live 연결을 시작해 주세요.");
    if (this.snapshot.phase === "connecting" || this.snapshot.phase === "reconnecting") throw new Error("Live 연결이 완료된 뒤 메시지를 보내 주세요.");
    if (!this.provider.isReady) {
      await this.reconnect("network");
      if (!this.provider.isReady) throw new Error("Live 연결을 복구하지 못했습니다. 다시 연결해 주세요.");
    }
    this.beginUserTurn(); this.clearMicHealthTimer(); this.audio.gate.close(); this.audio.gate.setSpeaking(false); this.audio.flushPlayback();
    if (this.desiredListening) this.provider.endInputAudio();
    this.capturePauseForPlayback = undefined; this.inputTranscriptOpen = true; this.outputTranscriptOpen = false;
    this.update({ phase: "thinking", inputTranscript: value, outputTranscript: "", error: undefined }); this.provider.sendText(value); this.armThinkingResponseTimer();
  }

  async changeVoice(voiceName: string): Promise<void> { if (this.voiceName === voiceName) return; this.voiceName = voiceName; if (this.snapshot.phase !== "disconnected") await this.reconnect("voice-change"); }
  async changeModel(modelId: string): Promise<void> { if (this.modelId === modelId) return; this.modelId = modelId; if (this.snapshot.phase !== "disconnected") await this.reconnect("model-change"); }

  async switchCharacter(characterId: string, voiceName: string, modelId: string): Promise<void> {
    this.characterId = characterId; this.voiceName = voiceName; this.modelId = modelId; this.audio.gate.close(); this.audio.flushPlayback(); this.desiredListening = false;
    this.clearReconnectTimer(); this.clearReconnectStabilityTimer(); this.clearThinkingResponseTimer(); this.clearAudioIdleCommitTimer(); this.clearTurnFinalizeTimer(); this.clearMicHealthTimer(); this.autoReconnectAttempts = 0; this.reconnecting = false;
    this.micTurnDetector.reset(); this.lastEmotion = "idle"; this.lastEmotionIntensity = 1; await this.audio.stopCapture(); this.capturePauseForPlayback = undefined; await this.provider.close();
    this.update({ phase: "disconnected", inputTranscript: "", outputTranscript: "", resumed: false, error: undefined });
  }

  private async reconnect(reason: "voice-change" | "model-change" | "go-away" | "network"): Promise<void> {
    if (this.reconnecting || this.disposed) return;
    this.clearThinkingResponseTimer(); this.clearAudioIdleCommitTimer(); this.clearTurnFinalizeTimer(); this.clearMicHealthTimer();
    const automatic = reason === "network" || reason === "go-away";
    if (automatic && this.autoReconnectAttempts >= MAX_AUTO_RECONNECT_ATTEMPTS) { this.failRecovery(); return; }
    if (automatic) this.autoReconnectAttempts += 1;
    this.reconnecting = true; this.transition("RECONNECT"); this.audio.gate.close(); this.audio.gate.setSpeaking(false); this.provider.endInputAudio(); this.audio.flushPlayback(); this.generationComplete = false; this.playbackEpoch += 1;
    try {
      await this.provider.close();
      if (reason === "network") await new Promise<void>((resolve) => window.setTimeout(resolve, 350));
      await this.provider.connect(this.characterId, this.voiceName, this.modelId);
      this.update({ reconnectCount: this.snapshot.reconnectCount + 1, error: undefined });
    } catch (error) {
      const message = error instanceof Error ? error.message : "재연결하지 못했습니다.";
      if (automatic && this.autoReconnectAttempts >= MAX_AUTO_RECONNECT_ATTEMPTS) this.failRecovery(message);
      else { this.transition("FAIL"); this.update({ error: message }); }
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
    try { await this.audio.commitBufferedPlayback(); void this.finishSpeakingWhenDrained(epoch); }
    catch (error) {
      this.clearThinkingResponseTimer(); this.clearAudioIdleCommitTimer(); this.clearTurnFinalizeTimer(); this.audio.flushPlayback(); this.audio.gate.setSpeaking(false); this.update({ error: error instanceof Error ? error.message : "오디오 재생에 실패했습니다." });
      await this.reopenListening();
    }
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
        this.clearThinkingResponseTimer(); this.markProviderActivity(); this.generationComplete = false;
        await this.enterPlaybackMode(); await this.audio.enqueuePcm24k(event.pcm); this.armAudioIdleCommitTimer(this.playbackEpoch); break;
      case "generation-complete":
        this.clearThinkingResponseTimer(); this.clearAudioIdleCommitTimer(); this.markProviderActivity(); this.generationComplete = true;
        await this.audio.commitBufferedPlayback(); this.armTurnFinalizeFallback(this.playbackEpoch); break;
      case "turn-complete": {
        this.clearThinkingResponseTimer(); this.clearAudioIdleCommitTimer(); this.clearTurnFinalizeTimer(); this.markProviderActivity(); this.generationComplete = true; this.inputTranscriptOpen = false;
        const epoch = this.playbackEpoch;
        if (await this.repairPrematureGemini25Turn(epoch)) break;
        await this.commitPlaybackAndFinish(epoch); break;
      }
      case "waiting-for-input": this.markProviderActivity(); await this.settleWaitingForInput(); break;
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
        this.clearThinkingResponseTimer(); this.markProviderActivity(); const previous = this.outputTranscriptOpen ? this.snapshot.outputTranscript : ""; this.outputTranscriptOpen = true;
        this.update({ outputTranscript: mergeStreamingTranscript(previous, event.text) }); break;
      }
      case "expression": this.markProviderActivity(); this.lastEmotion = event.emotion; this.lastEmotionIntensity = event.intensity; this.expressionListener?.(event.emotion, event.intensity); break;
      case "go-away":
        this.clearThinkingResponseTimer(); this.clearAudioIdleCommitTimer(); this.clearTurnFinalizeTimer(); this.clearMicHealthTimer(); this.clearReconnectStabilityTimer();
        if (!this.reconnecting && this.snapshot.phase !== "disconnected" && this.snapshot.phase !== "error") this.transition("RECONNECT");
        this.scheduleReconnect("go-away", Math.min(250, Math.max(20, event.timeLeftMs - 500))); break;
      case "closed":
        this.clearThinkingResponseTimer(); this.clearAudioIdleCommitTimer(); this.clearTurnFinalizeTimer(); this.clearMicHealthTimer(); this.clearReconnectStabilityTimer();
        if (!this.reconnecting && this.snapshot.phase !== "disconnected" && this.snapshot.phase !== "error") this.transition("RECONNECT");
        this.scheduleReconnect("network"); break;
      case "error":
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
    this.disposed = true; this.desiredListening = false; this.clearReconnectTimer(); this.clearReconnectStabilityTimer(); this.clearThinkingResponseTimer(); this.clearAudioIdleCommitTimer(); this.clearTurnFinalizeTimer(); this.clearMicHealthTimer(); this.audio.gate.close(); this.provider.endInputAudio(); await this.provider.close(); await this.audio.dispose(); this.capturePauseForPlayback = undefined;
  }
}
