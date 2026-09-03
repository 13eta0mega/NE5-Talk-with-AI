import { GoogleGenAI, Modality } from "@google/genai";
import { EMOTION_IDS, normalizeEmotionId, type EmotionId, type GestureId, type ProviderEvent } from "../types";
import { int16ToBase64 } from "../audio/pcm";
import { inferEmotionFromText } from "../emotion";
import { completionRepairPrompt, LIVE_INLINE_COMPLETION_REPAIRS, looksLikePrematureCutoff } from "../conversation/responseCompletion";
import { mergeStreamingTranscript } from "../conversation/transcript";
import { GeminiTtsAdapter, type TtsStreamer } from "./GeminiTtsAdapter";
import { isConversationalLiveModel, isGemini25LiveModel, isGemini31ExpressiveTtsMode, normalizeLiveModelId } from "./catalog";

type Subscriber = (event: ProviderEvent) => void;

const GESTURES = new Set<GestureId>([
  "none", "nod", "head_tilt_left", "head_tilt_right", "bounce", "wave", "shiver", "sway", "lean_forward", "settle",
]);

const KOREAN_LANGUAGE_CODE = "ko-KR";
const LIVE_CONNECT_TIMEOUT_MS = 12000;
const RESUME_CONNECT_TIMEOUT_MS = 6000;
const GO_AWAY_RECONNECT_LEAD_MS = 1200;
const EXTERNAL_TTS_FINALIZE_GRACE_MS = 240;
const EXTERNAL_TTS_FALLBACK_MAX_SAMPLES = 24_000 * 45;
const REALTIME_INPUT_CONFIG = {
  activityHandling: "NO_INTERRUPTION",
  automaticActivityDetection: {
    disabled: false,
    startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
    endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
    prefixPaddingMs: 120,
    silenceDurationMs: 900,
  },
};

function transcriptionConfig(modelId: string): Record<string, unknown> {
  return isGemini25LiveModel(modelId) ? {} : { languageCodes: [KOREAN_LANGUAGE_CODE] };
}

function speechConfig(modelId: string, voiceName: string): Record<string, unknown> {
  const config: Record<string, unknown> = {
    voiceConfig: { prebuiltVoiceConfig: { voiceName } },
  };
  if (!isGemini25LiveModel(modelId)) config.languageCode = KOREAN_LANGUAGE_CODE;
  return config;
}

function expressionTool() {
  return {
    functionDeclarations: [
      {
        name: "set_pet_expression",
        description: "Set the pet's visible empathetic expression before or during a spoken response.",
        parameters: {
          type: "OBJECT",
          properties: {
            emotion: { type: "STRING", enum: [...EMOTION_IDS] },
            intensity: { type: "NUMBER", minimum: 0, maximum: 1 },
            gesture: { type: "STRING" },
            hold_ms: { type: "INTEGER", minimum: 0, maximum: 10000 },
          },
          required: ["emotion", "intensity"],
        },
      },
    ],
  };
}

function closeMessage(code?: number, reason?: string): string {
  const detail = [code ? `code ${code}` : "", reason?.trim()].filter(Boolean).join(" · ");
  return detail ? `Gemini Live 연결이 종료되었습니다. (${detail})` : "Gemini Live 연결이 종료되었습니다.";
}

export class GeminiLiveAdapter {
  private session?: {
    sendRealtimeInput(params: unknown): void;
    sendClientContent(params: unknown): void;
    sendToolResponse(params: unknown): void;
    close(): void;
  };
  private subscriber?: Subscriber;
  private connectionEpoch = 0;
  private ready = false;
  private goAwayTimer?: number;
  private externalTtsFinalizeTimer?: number;
  private externalTtsFinalizePending = false;
  private activeModelId = "";
  private currentOutputTranscript = "";
  private inlineCompletionRepairs = 0;
  private modelAudioSeen = false;
  private externalTtsMode = false;
  private externalTtsActive = false;
  private externalTtsEpoch = 0;
  private externalTtsAudioSeen = false;
  private externalTtsFallbackAudio: Int16Array[] = [];
  private externalTtsFallbackSamples = 0;
  private currentCharacterId = "greus-greeny";
  private currentVoiceName = "Leda";
  private currentEmotion: EmotionId = "idle";
  private currentEmotionIntensity = 0.7;

  constructor(private readonly tts: TtsStreamer = new GeminiTtsAdapter()) {}

  get isReady(): boolean { return this.ready && Boolean(this.session); }

  onEvent(callback: Subscriber): () => void {
    this.subscriber = callback;
    return () => {
      if (this.subscriber === callback) this.subscriber = undefined;
    };
  }

  private emit(event: ProviderEvent): void {
    this.subscriber?.(event);
  }

  private clearGoAwayTimer(): void {
    if (this.goAwayTimer !== undefined) window.clearTimeout(this.goAwayTimer);
    this.goAwayTimer = undefined;
  }

  private clearExternalTtsFinalizeTimer(): void {
    if (this.externalTtsFinalizeTimer !== undefined) window.clearTimeout(this.externalTtsFinalizeTimer);
    this.externalTtsFinalizeTimer = undefined;
  }

  private clearExternalTtsFallbackAudio(): void {
    this.externalTtsFallbackAudio = [];
    this.externalTtsFallbackSamples = 0;
  }

  private bufferExternalTtsFallbackAudio(pcm: Int16Array): void {
    if (!pcm.length || this.externalTtsFallbackSamples >= EXTERNAL_TTS_FALLBACK_MAX_SAMPLES) return;
    const remaining = EXTERNAL_TTS_FALLBACK_MAX_SAMPLES - this.externalTtsFallbackSamples;
    const copy = pcm.length <= remaining ? pcm.slice() : pcm.slice(0, remaining);
    this.externalTtsFallbackAudio.push(copy);
    this.externalTtsFallbackSamples += copy.length;
  }

  private emitExternalTtsFallbackAudio(): boolean {
    if (!this.externalTtsFallbackAudio.length) return false;
    const chunks = this.externalTtsFallbackAudio;
    this.clearExternalTtsFallbackAudio();
    this.modelAudioSeen = true;
    for (const pcm of chunks) this.emit({ type: "audio", pcm });
    return true;
  }

  private cancelExternalTts(): void {
    this.clearExternalTtsFinalizeTimer();
    this.externalTtsFinalizePending = false;
    this.externalTtsEpoch += 1;
    this.externalTtsActive = false;
    this.externalTtsAudioSeen = false;
    this.clearExternalTtsFallbackAudio();
    this.tts.cancel();
  }

  private resetTurnTracking(): void {
    this.currentOutputTranscript = "";
    this.inlineCompletionRepairs = 0;
    this.modelAudioSeen = false;
    this.externalTtsFinalizePending = false;
    this.externalTtsAudioSeen = false;
    this.clearExternalTtsFallbackAudio();
  }

  private emitInferredExpression(text: string): void {
    const inferred = inferEmotionFromText(text);
    if (!inferred) return;
    this.currentEmotion = inferred.emotion;
    this.currentEmotionIntensity = inferred.intensity;
    this.emit({ type: "expression", emotion: inferred.emotion, intensity: inferred.intensity });
  }

  async connect(characterId: string, voiceName: string, modelId: string): Promise<void> {
    if (!window.deskPet) throw new Error("Live 모드는 Electron 앱에서 실행해야 합니다.");
    this.clearGoAwayTimer();
    this.cancelExternalTts();
    this.currentCharacterId = characterId;
    this.currentVoiceName = voiceName;
    this.externalTtsMode = isGemini31ExpressiveTtsMode(modelId);
    this.activeModelId = normalizeLiveModelId(modelId);
    this.resetTurnTracking();
    this.ready = false;
    this.session = undefined;
    const firstEpoch = ++this.connectionEpoch;
    const credentials = await window.deskPet.auth.createLiveToken({ characterId, voiceName, modelId });
    try {
      await this.openSession(characterId, voiceName, modelId, credentials, firstEpoch);
      return;
    } catch (error) {
      if (firstEpoch !== this.connectionEpoch || !credentials.hasResumeState) throw error;
    }

    await window.deskPet.session.update({ characterId, resumeHandle: null }).catch(() => undefined);
    const freshEpoch = ++this.connectionEpoch;
    const freshCredentials = await window.deskPet.auth.createLiveToken({ characterId, voiceName, modelId, freshSession: true });
    try {
      await this.openSession(characterId, voiceName, modelId, freshCredentials, freshEpoch);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "알 수 없는 연결 오류";
      throw new Error(`저장된 세션을 초기화했지만 Gemini Live 새 연결에도 실패했습니다: ${detail}`);
    }
  }

  private async openSession(
    characterId: string,
    voiceName: string,
    modelId: string,
    credentials: { token: string; model: string; expiresAt: number; hasResumeState: boolean },
    epoch: number,
  ): Promise<void> {
    const ai = new GoogleGenAI({ apiKey: credentials.token });
    const resolvedModel = normalizeLiveModelId(credentials.model);
    this.activeModelId = resolvedModel;
    this.externalTtsMode = isGemini31ExpressiveTtsMode(modelId);
    const is25 = isGemini25LiveModel(resolvedModel);
    const transcription = transcriptionConfig(resolvedModel);
    const config: Record<string, unknown> = {
      responseModalities: [Modality.AUDIO],
      speechConfig: speechConfig(resolvedModel, voiceName),
      inputAudioTranscription: transcription,
      outputAudioTranscription: transcription,
      realtimeInputConfig: REALTIME_INPUT_CONFIG,
      sessionResumption: {},
    };
    if (is25) {
      config.thinkingConfig = { thinkingBudget: 0 };
    } else {
      config.contextWindowCompression = { slidingWindow: {} };
      config.tools = [expressionTool()];
    }

    let setupSettled = false;
    let rejectSetup: ((reason?: unknown) => void) | undefined;
    const earlyFailure = new Promise<never>((_, reject) => { rejectSetup = reject; });
    let timeoutId: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      const timeoutMs = credentials.hasResumeState ? RESUME_CONNECT_TIMEOUT_MS : LIVE_CONNECT_TIMEOUT_MS;
      timeoutId = window.setTimeout(() => reject(new Error("Gemini Live 연결 준비 시간이 초과되었습니다.")), timeoutMs);
    });

    const connectPromise = ai.live.connect({
      model: credentials.model,
      config: config as never,
      callbacks: {
        onopen: () => {},
        onmessage: (message: unknown) => {
          if (epoch === this.connectionEpoch) this.handleMessage(message as Record<string, any>, characterId, voiceName, modelId);
        },
        onerror: (error: { message?: string }) => {
          if (epoch !== this.connectionEpoch) return;
          const message = error.message ?? "Live 연결 오류";
          this.ready = false;
          if (!setupSettled) rejectSetup?.(new Error(message));
          else this.emit({ type: "error", message });
        },
        onclose: (event: { reason?: string; code?: number }) => {
          if (epoch !== this.connectionEpoch) return;
          this.clearGoAwayTimer();
          this.cancelExternalTts();
          this.ready = false;
          this.session = undefined;
          const message = closeMessage(event.code, event.reason);
          if (!setupSettled) rejectSetup?.(new Error(message));
          else this.emit({ type: "closed", reason: event.reason, code: event.code });
        },
      },
    });

    let session: Awaited<typeof connectPromise>;
    try {
      session = await Promise.race([connectPromise, earlyFailure, timeout]);
      setupSettled = true;
    } catch (error) {
      setupSettled = true;
      void connectPromise.then((lateSession) => lateSession.close()).catch(() => undefined);
      throw error;
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    }

    if (epoch !== this.connectionEpoch) {
      session.close();
      return;
    }
    this.session = session as unknown as typeof this.session;
    this.ready = true;
    this.emit({ type: "connected", resumed: credentials.hasResumeState });
  }

  sendPcm16(chunk: Int16Array): void {
    if (!this.isReady) return;
    this.session?.sendRealtimeInput({
      audio: { data: int16ToBase64(chunk), mimeType: "audio/pcm;rate=16000" },
    });
  }

  private sendTextTurn(text: string): void {
    if (!this.session) return;
    // Gemini 3.1 Live uses realtime text during an active conversation. Gemini
    // 2.5 supports incremental client-content turns, so retain its proven path.
    if (isGemini25LiveModel(this.activeModelId)) {
      this.session.sendClientContent({ turns: text, turnComplete: true });
      return;
    }
    this.session.sendRealtimeInput({ text });
  }

  sendText(text: string): void {
    if (!this.isReady) throw new Error("Live 연결이 아직 준비되지 않았습니다.");
    this.cancelExternalTts();
    this.resetTurnTracking();
    this.emitInferredExpression(text);
    this.sendTextTurn(text);
  }

  sendContinuationRecovery(): void {
    if (!this.isReady) return;
    this.sendTextTurn(completionRepairPrompt());
  }

  endInputAudio(): void {
    if (!this.isReady) return;
    this.session?.sendRealtimeInput({ audioStreamEnd: true });
  }

  async close(): Promise<void> {
    this.clearGoAwayTimer();
    this.cancelExternalTts();
    this.connectionEpoch += 1;
    this.ready = false;
    this.session?.close();
    this.session = undefined;
  }

  private shouldRepairInlineTurn(serverContent: Record<string, any> | undefined): boolean {
    if (!serverContent?.turnComplete || serverContent?.interrupted) return false;
    if (!isConversationalLiveModel(this.activeModelId)) return false;
    if (this.inlineCompletionRepairs >= LIVE_INLINE_COMPLETION_REPAIRS) return false;
    if (!this.modelAudioSeen || !looksLikePrematureCutoff(this.currentOutputTranscript)) return false;
    return true;
  }

  private scheduleExternalTtsFinalize(): void {
    this.clearExternalTtsFinalizeTimer();
    this.externalTtsFinalizePending = true;
    this.externalTtsFinalizeTimer = window.setTimeout(() => {
      this.externalTtsFinalizeTimer = undefined;
      this.externalTtsFinalizePending = false;
      this.finalizeExternalTtsTurn();
    }, EXTERNAL_TTS_FINALIZE_GRACE_MS);
  }

  private finalizeExternalTtsTurn(): void {
    this.clearExternalTtsFinalizeTimer();
    this.externalTtsFinalizePending = false;
    if (!this.externalTtsMode || this.externalTtsActive) return;
    const text = this.currentOutputTranscript.trim();
    if (!text) {
      const fallbackUsed = this.emitExternalTtsFallbackAudio();
      this.emit({
        type: "tts-error",
        message: fallbackUsed
          ? "표현형 TTS 오류: Gemini Live 출력 전사를 받지 못해 Live 기본 음성으로 대체 재생했습니다."
          : "표현형 TTS 오류: Gemini Live 출력 전사를 받지 못했습니다.",
      });
      this.emit({ type: "generation-complete" });
      this.emit({ type: "turn-complete" });
      this.resetTurnTracking();
      return;
    }

    this.externalTtsActive = true;
    this.externalTtsAudioSeen = false;
    const epoch = ++this.externalTtsEpoch;
    const request = {
      text,
      characterId: this.currentCharacterId,
      voiceName: this.currentVoiceName,
      emotion: this.currentEmotion,
      intensity: this.currentEmotionIntensity,
    };
    void this.tts.stream(request, async (pcm) => {
      if (epoch !== this.externalTtsEpoch || !this.externalTtsMode) return;
      this.externalTtsAudioSeen = true;
      this.modelAudioSeen = true;
      this.emit({ type: "audio", pcm });
    }).then(() => {
      if (epoch !== this.externalTtsEpoch || !this.externalTtsMode) return;
      this.externalTtsActive = false;
      this.clearExternalTtsFallbackAudio();
      this.emit({ type: "generation-complete" });
      this.emit({ type: "turn-complete" });
      this.resetTurnTracking();
    }).catch((error) => {
      if (epoch !== this.externalTtsEpoch || !this.externalTtsMode) return;
      this.externalTtsActive = false;
      const message = error instanceof Error ? error.message : "Gemini 3.1 Flash TTS 스트리밍에 실패했습니다.";
      const fallbackUsed = !this.externalTtsAudioSeen && this.emitExternalTtsFallbackAudio();
      console.error("[deskpet:tts] expressive TTS playback failed", { message, fallbackUsed });
      this.emit({
        type: "tts-error",
        message: fallbackUsed
          ? `표현형 TTS 오류: ${message} · Live 기본 음성으로 대체 재생했습니다.`
          : `표현형 TTS 오류: ${message}`,
      });
      this.emit({ type: "generation-complete" });
      this.emit({ type: "turn-complete" });
      this.resetTurnTracking();
    });
  }

  private handleMessage(message: Record<string, any>, characterId: string, voiceName: string, modelId: string): void {
    const serverContent = message.serverContent;
    const modelParts = serverContent?.modelTurn?.parts ?? [];
    const encodedAudioParts: string[] = typeof message.data === "string"
      ? [message.data]
      : modelParts
        .map((part: any) => part.inlineData?.data)
        .filter((data: unknown): data is string => typeof data === "string");
    for (const encodedAudio of encodedAudioParts) {
      const binary = atob(encodedAudio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const pcm = new Int16Array(bytes.buffer);
      if (this.externalTtsMode) {
        this.bufferExternalTtsFallbackAudio(pcm);
        continue;
      }
      this.modelAudioSeen = true;
      this.emit({ type: "audio", pcm });
    }

    const inputText = serverContent?.inputTranscription?.text;
    const outputText = serverContent?.outputTranscription?.text;
    if (inputText) {
      if (!this.modelAudioSeen && !this.currentOutputTranscript) this.inlineCompletionRepairs = 0;
      this.emit({ type: "input-transcript", text: inputText });
      this.emitInferredExpression(inputText);
    }
    if (outputText) {
      const finalizePending = this.externalTtsMode && this.externalTtsFinalizePending;
      this.currentOutputTranscript = mergeStreamingTranscript(this.currentOutputTranscript, outputText);
      this.emit({ type: "output-transcript", text: outputText });
      this.emitInferredExpression(outputText);
      if (finalizePending) this.scheduleExternalTtsFinalize();
    }

    const calls = message.toolCall?.functionCalls ?? [];
    if (calls.length) {
      const responses = calls.map((call: any) => {
        if (call.name === "set_pet_expression") {
          const emotion = normalizeEmotionId(call.args?.emotion);
          const intensity = Math.max(0, Math.min(1, Number(call.args?.intensity ?? 0.7)));
          const gesture = GESTURES.has(call.args?.gesture) ? call.args.gesture as GestureId : undefined;
          this.currentEmotion = emotion;
          this.currentEmotionIntensity = intensity;
          this.emit({ type: "expression", emotion, intensity, gesture });
        }
        return { id: call.id, name: call.name, response: { result: { acknowledged: true } } };
      });
      this.session?.sendToolResponse({ functionResponses: responses });
    }

    if (serverContent?.interrupted) {
      this.cancelExternalTts();
      this.resetTurnTracking();
      this.emit({ type: "interrupted" });
    } else if (this.externalTtsMode) {
      if (serverContent?.turnComplete || serverContent?.waitingForInput || serverContent?.generationComplete) {
        this.scheduleExternalTtsFinalize();
      }
    } else if (this.shouldRepairInlineTurn(serverContent)) {
      this.inlineCompletionRepairs += 1;
      this.sendTextTurn(completionRepairPrompt());
    } else {
      if (serverContent?.waitingForInput) this.emit({ type: "waiting-for-input" });
      if (serverContent?.generationComplete) this.emit({ type: "generation-complete" });
      if (serverContent?.turnComplete) {
        this.emit({ type: "turn-complete" });
        this.resetTurnTracking();
      }
    }

    const resume = message.sessionResumptionUpdate;
    if (resume?.resumable && resume.newHandle) {
      void window.deskPet?.session.update({
        characterId,
        resumeHandle: resume.newHandle,
        resumeHandleUpdatedAt: Date.now(),
        resumeVoiceName: voiceName,
        resumeModelId: modelId,
      });
      this.emit({ type: "resume-handle", handle: resume.newHandle });
    }
    if (message.goAway) {
      const raw = message.goAway.timeLeft ?? message.goAway.timeLeftMs ?? 0;
      const parsedTimeLeftMs = typeof raw === "string" ? Number.parseFloat(raw) * 1000 : Number(raw);
      const timeLeftMs = Number.isFinite(parsedTimeLeftMs) ? Math.max(0, parsedTimeLeftMs) : 0;
      const delayMs = Math.max(0, timeLeftMs - GO_AWAY_RECONNECT_LEAD_MS);
      this.clearGoAwayTimer();
      const emitGoAway = () => {
        this.goAwayTimer = undefined;
        if (!this.isReady) return;
        this.emit({ type: "go-away", timeLeftMs: Math.min(timeLeftMs, GO_AWAY_RECONNECT_LEAD_MS) });
      };
      if (delayMs === 0) emitGoAway();
      else this.goAwayTimer = window.setTimeout(emitGoAway, delayMs);
    }
  }
}
