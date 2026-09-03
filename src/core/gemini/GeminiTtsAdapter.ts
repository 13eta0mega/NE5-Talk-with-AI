import type { EmotionId } from "../types";

const BROWSER_API_KEY_STORAGE_KEY = "deskpet:mobile-gemini-api-key:v1";

export interface ExpressiveTtsRequest {
  text: string;
  characterId: string;
  voiceName: string;
  emotion: EmotionId;
  intensity: number;
}

export interface TtsStreamer {
  stream(request: ExpressiveTtsRequest, onChunk: (pcm: Int16Array) => void | Promise<void>): Promise<void>;
  cancel(): void;
}

function browserApiKey(): string | undefined {
  if (typeof localStorage === "undefined") return undefined;
  const value = localStorage.getItem(BROWSER_API_KEY_STORAGE_KEY)?.trim();
  return value || undefined;
}

function appendBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  if (!left.length) return right;
  const merged = new Uint8Array(left.length + right.length);
  merged.set(left, 0);
  merged.set(right, left.length);
  return merged;
}

export class GeminiTtsAdapter implements TtsStreamer {
  private controller?: AbortController;
  private requestEpoch = 0;

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly apiKeyProvider: () => string | undefined = browserApiKey,
  ) {}

  cancel(): void {
    this.requestEpoch += 1;
    this.controller?.abort();
    this.controller = undefined;
  }

  async stream(request: ExpressiveTtsRequest, onChunk: (pcm: Int16Array) => void | Promise<void>): Promise<void> {
    this.cancel();
    const epoch = this.requestEpoch;
    const controller = new AbortController();
    this.controller = controller;

    let response: Response;
    try {
      response = await this.fetcher("/api/tts-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({ ...request, apiKey: this.apiKeyProvider() }),
      });
    } catch (error) {
      if (controller.signal.aborted || epoch !== this.requestEpoch) return;
      throw error;
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error || `Gemini TTS 요청에 실패했습니다. (${response.status})`);
    }
    if (!response.body) throw new Error("Gemini TTS 오디오 스트림을 받지 못했습니다.");

    const reader = response.body.getReader();
    let carry = new Uint8Array(0);
    let sampleCount = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done || controller.signal.aborted || epoch !== this.requestEpoch) break;
        if (!value?.length) continue;
        const bytes = appendBytes(carry, value);
        const evenLength = bytes.length - (bytes.length % 2);
        carry = evenLength === bytes.length ? new Uint8Array(0) : bytes.slice(evenLength);
        if (!evenLength) continue;
        const pcmBytes = bytes.slice(0, evenLength);
        const pcm = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength / 2);
        sampleCount += pcm.length;
        await onChunk(pcm);
      }
    } finally {
      reader.releaseLock();
      if (this.controller === controller) this.controller = undefined;
    }

    if (controller.signal.aborted || epoch !== this.requestEpoch) return;
    if (carry.length) throw new Error("Gemini TTS PCM 스트림이 올바른 16-bit 경계로 끝나지 않았습니다.");
    if (!sampleCount) throw new Error("Gemini TTS가 오디오 샘플을 반환하지 않았습니다.");
  }
}
