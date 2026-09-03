import { GoogleGenAI, Modality } from "@google/genai";
import { EMOTION_IDS, normalizeEmotionId, type GestureId, type ProviderEvent } from "../types";
import { int16ToBase64 } from "../audio/pcm";
import { inferEmotionFromText } from "../emotion";
import { completionRepairPrompt } from "../conversation/responseCompletion";
import { isGemini25LiveModel, normalizeLiveModelId } from "./catalog";

type Subscriber = (event: ProviderEvent) => void;

const GESTURES = new Set<GestureId>([
  "none", "nod", "head_tilt_left", "head_tilt_right", "bounce", "wave", "shiver", "sway", "lean_forward", "settle",
]);

const KOREAN_LANGUAGE_CODE = "ko-KR";
const LIVE_CONNECT_TIMEOUT_MS = 12000;
const RESUME_CONNECT_TIMEOUT_MS = 6000;
const REALTIME_INPUT_CONFIG = {
  activityHandling: "NO_INTERRUPTION",
  automaticActivityDetection: {
    disabled: false,
    // HIGH is the more sensitive mode in Gemini Live. LOW was causing quiet/short
    // Korean utterances to be missed, especially after several Native Audio turns.
    startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
    endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
    prefixPaddingMs: 120,
    silenceDurationMs: 650,
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

  private emitInferredExpression(text: string): void {
    const inferred = inferEmotionFromText(text);
    if (!inferred) return;
    this.emit({ type: "expression", emotion: inferred.emotion, intensity: inferred.intensity });
  }

  async connect(characterId: string, voiceName: string, modelId: string): Promise<void> {
    if (!window.deskPet) throw new Error("Live 모드는 Electron 앱에서 실행해야 합니다.");
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

    // Gemini accepts an ephemeral token constrained to an expired/invalid resume
    // handle, opens the WebSocket, and then never sends setupComplete. Retrying the
    // same handle therefore creates a permanent timeout loop. Clear it and issue a
    // new one-use token for a genuinely fresh Live session.
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

  sendText(text: string): void {
    if (!this.isReady) throw new Error("Live 연결이 아직 준비되지 않았습니다.");
    this.emitInferredExpression(text);
    this.session?.sendClientContent({ turns: text, turnComplete: true });
  }

  sendContinuationRecovery(): void {
    if (!this.isReady) return;
    this.session?.sendClientContent({ turns: completionRepairPrompt(), turnComplete: true });
  }

  endInputAudio(): void {
    if (!this.isReady) return;
    this.session?.sendRealtimeInput({ audioStreamEnd: true });
  }

  async close(): Promise<void> {
    this.connectionEpoch += 1;
    this.ready = false;
    this.session?.close();
    this.session = undefined;
  }

  private handleMessage(message: Record<string, any>, characterId: string, voiceName: string, modelId: string): void {
    const serverContent = message.serverContent;
    const encodedAudioParts: string[] = typeof message.data === "string"
      ? [message.data]
      : (serverContent?.modelTurn?.parts ?? [])
        .map((part: any) => part.inlineData?.data)
        .filter((data: unknown): data is string => typeof data === "string");
    for (const encodedAudio of encodedAudioParts) {
      const binary = atob(encodedAudio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      this.emit({ type: "audio", pcm: new Int16Array(bytes.buffer) });
    }

    const inputText = serverContent?.inputTranscription?.text;
    const outputText = serverContent?.outputTranscription?.text;
    if (inputText) {
      this.emit({ type: "input-transcript", text: inputText });
      this.emitInferredExpression(inputText);
    }
    if (outputText) {
      this.emit({ type: "output-transcript", text: outputText });
      this.emitInferredExpression(outputText);
    }
    if (serverContent?.waitingForInput) this.emit({ type: "waiting-for-input" });
    if (serverContent?.generationComplete) this.emit({ type: "generation-complete" });
    if (serverContent?.turnComplete) this.emit({ type: "turn-complete" });
    if (serverContent?.interrupted) this.emit({ type: "interrupted" });

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
      const timeLeftMs = typeof raw === "string" ? Number.parseFloat(raw) * 1000 : Number(raw);
      this.emit({ type: "go-away", timeLeftMs: Number.isFinite(timeLeftMs) ? timeLeftMs : 0 });
    }

    const calls = message.toolCall?.functionCalls ?? [];
    if (calls.length) {
      const responses = calls.map((call: any) => {
        if (call.name === "set_pet_expression") {
          const emotion = normalizeEmotionId(call.args?.emotion);
          const intensity = Math.max(0, Math.min(1, Number(call.args?.intensity ?? 0.7)));
          const gesture = GESTURES.has(call.args?.gesture) ? call.args.gesture as GestureId : undefined;
          // Native tool output remains authoritative for newer models.
          this.emit({ type: "expression", emotion, intensity, gesture });
        }
        return { id: call.id, name: call.name, response: { result: { acknowledged: true } } };
      });
      this.session?.sendToolResponse({ functionResponses: responses });
    }
  }
}
