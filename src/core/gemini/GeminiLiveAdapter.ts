import { GoogleGenAI, Modality } from "@google/genai";
import { EMOTION_IDS, type EmotionId, type GestureId, type ProviderEvent } from "../types";
import { int16ToBase64 } from "../audio/pcm";

type Subscriber = (event: ProviderEvent) => void;

const GESTURES = new Set<GestureId>([
  "none", "nod", "head_tilt_left", "head_tilt_right", "bounce", "wave", "shiver", "sway", "lean_forward", "settle",
]);

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

export class GeminiLiveAdapter {
  private session?: {
    sendRealtimeInput(params: unknown): void;
    sendToolResponse(params: unknown): void;
    close(): void;
  };
  private subscriber?: Subscriber;
  private connectionEpoch = 0;
  private ready = false;

  onEvent(callback: Subscriber): () => void {
    this.subscriber = callback;
    return () => {
      if (this.subscriber === callback) this.subscriber = undefined;
    };
  }

  private emit(event: ProviderEvent): void {
    this.subscriber?.(event);
  }

  async connect(characterId: string, voiceName: string, modelId: string): Promise<void> {
    if (!window.deskPet) throw new Error("Live 모드는 Electron 앱에서 실행해야 합니다.");
    const epoch = ++this.connectionEpoch;
    this.ready = false;
    const credentials = await window.deskPet.auth.createLiveToken({ characterId, voiceName, modelId });
    const ai = new GoogleGenAI({ apiKey: credentials.token, httpOptions: { apiVersion: "v1beta" } });

    const session = await ai.live.connect({
      model: credentials.model,
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        contextWindowCompression: { slidingWindow: {} },
        sessionResumption: {},
        tools: [expressionTool()],
      } as never,
      callbacks: {
        onopen: () => {
          if (epoch !== this.connectionEpoch) return;
          this.ready = true;
          this.emit({ type: "connected", resumed: credentials.hasResumeState });
        },
        onmessage: (message: unknown) => {
          if (epoch === this.connectionEpoch) this.handleMessage(message as Record<string, any>, characterId, voiceName, modelId);
        },
        onerror: (error: { message?: string }) => {
          if (epoch === this.connectionEpoch) this.emit({ type: "error", message: error.message ?? "Live 연결 오류" });
        },
        onclose: (event: { reason?: string }) => {
          if (epoch !== this.connectionEpoch) return;
          this.ready = false;
          this.emit({ type: "closed", reason: event.reason });
        },
      },
    });
    this.session = session as unknown as typeof this.session;
  }

  sendPcm16(chunk: Int16Array): void {
    if (!this.ready) return;
    this.session?.sendRealtimeInput({
      audio: { data: int16ToBase64(chunk), mimeType: "audio/pcm;rate=16000" },
    });
  }

  endInputAudio(): void {
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
    const encodedAudio = typeof message.data === "string"
      ? message.data
      : serverContent?.modelTurn?.parts?.find((part: any) => part.inlineData?.data)?.inlineData?.data;
    if (encodedAudio) {
      const binary = atob(encodedAudio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      this.emit({ type: "audio", pcm: new Int16Array(bytes.buffer) });
    }

    const inputText = serverContent?.inputTranscription?.text;
    const outputText = serverContent?.outputTranscription?.text;
    if (inputText) this.emit({ type: "input-transcript", text: inputText });
    if (outputText) this.emit({ type: "output-transcript", text: outputText });
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
          const emotion = EMOTION_IDS.includes(call.args?.emotion) ? call.args.emotion as EmotionId : "neutral";
          const intensity = Math.max(0, Math.min(1, Number(call.args?.intensity ?? 0.7)));
          const gesture = GESTURES.has(call.args?.gesture) ? call.args.gesture as GestureId : undefined;
          this.emit({ type: "expression", emotion, intensity, gesture });
        }
        return { id: call.id, name: call.name, response: { result: { acknowledged: true } } };
      });
      this.session?.sendToolResponse({ functionResponses: responses });
    }
  }
}
