/// <reference types="node" />

import {
  createClient, isCharacterId, isTrustedBrowserRequest, isVoiceName, noStore, normalizeClientApiKey, parseBody,
  type ApiRequest, type ApiResponse,
} from "./_shared.js";
import { GEMINI_31_TTS_MODEL } from "../src/core/gemini/catalog.js";
import { buildCharacterTtsPrompt, MAX_EXPRESSIVE_TTS_TEXT_LENGTH } from "../src/core/gemini/ttsVoiceDirector.js";
import { EMOTION_IDS, type EmotionId } from "../src/core/types.js";

type StreamingApiResponse = ApiResponse & {
  write(chunk: Uint8Array): boolean;
  end(): void;
  headersSent?: boolean;
};

type AudioDeltaEvent = {
  event_type?: string;
  delta?: { type?: string; data?: string };
};

function isEmotionId(value: unknown): value is EmotionId {
  return typeof value === "string" && (EMOTION_IDS as readonly string[]).includes(value);
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  noStore(response);
  if (request.method !== "POST") {
    response.status(405).json({ error: "POST 요청만 허용됩니다." });
    return;
  }
  if (!isTrustedBrowserRequest(request)) {
    response.status(403).json({ error: "허용되지 않은 출처입니다." });
    return;
  }

  const streamingResponse = response as StreamingApiResponse;
  try {
    const body = parseBody(request);
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!isCharacterId(body.characterId) || !isVoiceName(body.voiceName) || !isEmotionId(body.emotion)) {
      response.status(400).json({ error: "올바르지 않은 TTS 요청입니다." });
      return;
    }
    if (!text || text.length > MAX_EXPRESSIVE_TTS_TEXT_LENGTH) {
      response.status(400).json({ error: `TTS 대사는 1~${MAX_EXPRESSIVE_TTS_TEXT_LENGTH}자여야 합니다.` });
      return;
    }
    const intensity = Math.max(0, Math.min(1, Number(body.intensity ?? 0.7)));
    const client = await createClient(normalizeClientApiKey(body.apiKey));
    const input = buildCharacterTtsPrompt(text, body.emotion, Number.isFinite(intensity) ? intensity : 0.7);

    const stream = await client.interactions.create({
      model: GEMINI_31_TTS_MODEL,
      input,
      response_format: { type: "audio" },
      generation_config: {
        speech_config: [{ voice: body.voiceName }],
      },
      stream: true,
    } as never) as AsyncIterable<AudioDeltaEvent>;

    response.setHeader("Content-Type", "audio/pcm;rate=24000");
    response.setHeader("X-Audio-Sample-Rate", "24000");
    response.setHeader("X-Audio-Channels", "1");
    response.setHeader("X-Audio-Format", "s16le");

    let bytesWritten = 0;
    for await (const event of stream) {
      if (event.event_type !== "step.delta" || event.delta?.type !== "audio" || typeof event.delta.data !== "string") continue;
      const audio = Buffer.from(event.delta.data, "base64");
      if (!audio.length) continue;
      bytesWritten += audio.length;
      streamingResponse.write(audio);
    }
    if (!bytesWritten) throw new Error("Gemini 3.1 Flash TTS가 오디오를 반환하지 않았습니다.");
    streamingResponse.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini TTS 스트리밍에 실패했습니다.";
    if (!streamingResponse.headersSent) response.status(500).json({ error: message });
    else streamingResponse.end();
  }
}
