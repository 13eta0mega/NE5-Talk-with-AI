import { AudioEngine } from "../audio/AudioEngine";
import { GeminiLiveAdapter } from "../gemini/GeminiLiveAdapter";
import { DEFAULT_VOICE_NAME } from "../gemini/catalog";
import { nextPhase } from "../session/sessionMachine";
import type { ConversationPhase, EmotionId, ProviderEvent } from "../types";
import { mergeStreamingTranscript } from "./transcript";

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
  private snapshot: ConversationSnapshot = {
    phase: "disconnected",
    inputTranscript: "",
    outputTranscript: "",
    resumed: false,
    reconnectCount: 0,
  };
  private listeners = new Set<(value: ConversationSnapshot) => void>();
  private expressionListener?: (emotion: EmotionId, intensity: number) => void;
  private characterId = "greus-greeny";
  private voiceName = DEFAULT_VOICE_NAME;
  private modelId = "gemini-3.1-flash-live-preview";
  private generationComplete = false;
  private audioSequence = 0;
  private reconnecting = false;
  private desiredListening = false;
  private microphoneDeviceId = "default";
  private lastEmotion: EmotionId = "idle";
  private lastEmotionIntensity = 1;
  private disposed = false;
  private inputTranscriptOpen = false;
  private outputTranscriptOpen = false;
  private reconnectTimer?: number;
  private capturePauseForPlayback?: Promise<void>;

  constructor() {
    this.provider.onEvent((event) => void this.handleProviderEvent(event));
    this.audio.onCapturePcm = (chunk) => this.provider.sendPcm16(chunk);
  }

  subscribe(listener: (value: ConversationSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  onExpression(listener: (emotion: EmotionId, intensity: number) => void): void {
    this.expressionListener = listener;
  }

  resetExpression(): void {
    this.lastEmotion = "idle";
    this.lastEmotionIntensity = 1;
    this.expressionListener?.("idle", 1);
  }

  async changeMicrophoneDevice(deviceId: string): Promise<void> {
    this.microphoneDeviceId = deviceId;
    if (this.desiredListening) await this.audio.startCapture(deviceId);
  }

  private update(patch: Partial<ConversationSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }

  private transition(event: Parameters<typeof nextPhase>[1]): void {
    this.update({ phase: nextPhase(this.snapshot.phase, event) });
  }

  private async enterPlaybackMode(): Promise<void> {
    if (!this.capturePauseForPlayback) {
      this.audio.gate.close();
      this.capturePauseForPlayback = this.audio.pauseCaptureForPlayback();
    }
    await this.capturePauseForPlayback;
  }

  private async restoreListeningCapture(): Promise<void> {
    try {
      if (this.capturePauseForPlayback) await this.capturePauseForPlayback;
      if (this.desiredListening) await this.audio.startCapture(this.microphoneDeviceId);
    } finally {
      this.capturePauseForPlayback = undefined;
    }
  }

  async connect(characterId: string, voiceName: string, modelId: string): Promise<void> {
    this.disposed = false;
    this.characterId = characterId;
    this.voiceName = voiceName;
    this.modelId = modelId;
    this.transition(this.snapshot.phase === "error" ? "RETRY" : "CONNECT");
    this.update({ error: undefined });
    try {
      await this.audio.preparePlayback();
      await this.provider.connect(characterId, voiceName, modelId);
    } catch (error) {
      this.transition("FAIL");
      this.update({ error: error instanceof Error ? error.message : "연결할 수 없습니다." });
      throw error;
    }
  }

  async startListening(deviceId = "default"): Promise<void> {
    if (this.snapshot.phase === "disconnected" || this.snapshot.phase === "error") {
      throw new Error("먼저 Live 연결을 시작해 주세요.");
    }
    this.desiredListening = true;
    this.microphoneDeviceId = deviceId;
    this.capturePauseForPlayback = undefined;
    await this.audio.startCapture(deviceId);
    this.audio.gate.setSpeaking(false);
    this.audio.gate.open();
    this.transition("START_LISTENING");
  }

  stopListening(): void {
    this.desiredListening = false;
    this.audio.gate.close();
    this.provider.endInputAudio();
    void this.audio.stopCapture();
    this.transition("USER_SPEECH_END");
  }

  async changeVoice(voiceName: string): Promise<void> {
    if (this.voiceName === voiceName) return;
    this.voiceName = voiceName;
    if (this.snapshot.phase === "disconnected") return;
    await this.reconnect("voice-change");
  }

  async changeModel(modelId: string): Promise<void> {
    if (this.modelId === modelId) return;
    this.modelId = modelId;
    if (this.snapshot.phase === "disconnected") return;
    await this.reconnect("model-change");
  }

  async switchCharacter(characterId: string, voiceName: string, modelId: string): Promise<void> {
    this.characterId = characterId;
    this.voiceName = voiceName;
    this.modelId = modelId;
    this.audio.gate.close();
    this.audio.flushPlayback();
    this.desiredListening = false;
    this.lastEmotion = "idle";
    this.lastEmotionIntensity = 1;
    await this.audio.stopCapture();
    this.capturePauseForPlayback = undefined;
    await this.provider.close();
    this.update({ phase: "disconnected", inputTranscript: "", outputTranscript: "", resumed: false });
  }

  private async reconnect(reason: "voice-change" | "model-change" | "go-away" | "network"): Promise<void> {
    if (this.reconnecting || this.disposed) return;
    this.reconnecting = true;
    this.transition("RECONNECT");
    this.audio.gate.close();
    this.audio.gate.setSpeaking(false);
    this.audio.flushPlayback();
    this.generationComplete = false;
    this.audioSequence += 1;
    try {
      await this.provider.close();
      if (reason === "network") await new Promise<void>((resolve) => window.setTimeout(resolve, 350));
      await this.provider.connect(this.characterId, this.voiceName, this.modelId);
      this.update({ reconnectCount: this.snapshot.reconnectCount + 1 });
    } catch (error) {
      this.transition("FAIL");
      this.update({ error: error instanceof Error ? error.message : "재연결하지 못했습니다." });
    } finally {
      this.reconnecting = false;
    }
  }

  private scheduleReconnect(reason: "go-away" | "network", delayMs = 120): void {
    if (this.disposed) return;
    if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.reconnecting) {
        this.scheduleReconnect(reason, 350);
        return;
      }
      void this.reconnect(reason);
    }, delayMs);
  }

  private async handleProviderEvent(event: ProviderEvent): Promise<void> {
    switch (event.type) {
      case "connected":
        this.update({
          phase: this.desiredListening ? "listening" : this.snapshot.phase === "reconnecting" ? "idle" : nextPhase(this.snapshot.phase, "CONNECTED"),
          resumed: event.resumed,
          error: undefined,
        });
        if (this.desiredListening) {
          await this.restoreListeningCapture();
          this.audio.gate.setSpeaking(false);
          this.audio.gate.open();
        }
        this.expressionListener?.(this.lastEmotion, this.lastEmotionIntensity);
        break;
      case "audio":
        this.audioSequence += 1;
        this.generationComplete = false;
        this.audio.gate.setSpeaking(true);
        if (this.snapshot.phase !== "speaking") this.transition("MODEL_AUDIO_START");
        await this.enterPlaybackMode();
        await this.audio.enqueuePcm24k(event.pcm);
        break;
      case "generation-complete":
      case "turn-complete":
        this.generationComplete = true;
        if (event.type === "turn-complete") {
          this.inputTranscriptOpen = false;
        }
        void this.finishSpeakingWhenDrained(this.audioSequence);
        break;
      case "interrupted":
        this.audioSequence += 1;
        this.generationComplete = false;
        this.audio.flushPlayback();
        this.audio.gate.setSpeaking(false);
        if (this.desiredListening) {
          await this.restoreListeningCapture();
          this.audio.gate.open();
          this.update({ phase: "listening" });
        } else this.capturePauseForPlayback = undefined;
        break;
      case "input-transcript": {
        const previous = this.inputTranscriptOpen ? this.snapshot.inputTranscript : "";
        if (!this.inputTranscriptOpen) this.outputTranscriptOpen = false;
        this.inputTranscriptOpen = true;
        this.update({ inputTranscript: mergeStreamingTranscript(previous, event.text) });
        break;
      }
      case "output-transcript": {
        const previous = this.outputTranscriptOpen ? this.snapshot.outputTranscript : "";
        this.outputTranscriptOpen = true;
        this.update({ outputTranscript: mergeStreamingTranscript(previous, event.text) });
        break;
      }
      case "expression":
        this.lastEmotion = event.emotion;
        this.lastEmotionIntensity = event.intensity;
        this.expressionListener?.(event.emotion, event.intensity);
        break;
      case "go-away": this.scheduleReconnect("go-away", Math.min(250, Math.max(20, event.timeLeftMs - 500))); break;
      case "closed": this.scheduleReconnect("network"); break;
      case "error":
        this.update({ error: event.message });
        if (!["connecting", "disconnected", "error"].includes(this.snapshot.phase)) this.scheduleReconnect("network", 450);
        break;
      default: break;
    }
  }

  private async finishSpeakingWhenDrained(sequence: number): Promise<void> {
    await this.audio.waitForDrain(160);
    if (!this.generationComplete || sequence !== this.audioSequence) return;
    this.audio.gate.setSpeaking(false);
    if (this.desiredListening) {
      await this.restoreListeningCapture();
      this.audio.gate.open();
      this.transition("PLAYBACK_DRAINED");
    } else {
      this.capturePauseForPlayback = undefined;
      this.update({ phase: "idle" });
    }
  }

  diagnostics() {
    return { ...this.audio.gate.diagnostics(), phase: this.snapshot.phase, reconnectCount: this.snapshot.reconnectCount };
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.desiredListening = false;
    if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer);
    this.audio.gate.close();
    await this.provider.close();
    await this.audio.dispose();
    this.capturePauseForPlayback = undefined;
  }
}
