/// <reference types="node" />

import {
  createClient, isCharacterId, isTrustedBrowserRequest, isVoiceName, noStore, normalizeClientApiKey, parseBody,
  type ApiRequest, type ApiResponse,
} from "./_shared.js";
import { GEMINI_31_TTS_MODEL } from "../src/core/gemini/catalog.js";
import { buildCharacterTtsPrompt, MAX_EXPRESSIVE_TTS_TEXT_LENGTH } from "../src/core/gemini/ttsVoiceDirector.js";
import { normalizeVoicePitch } from "../src/core/gemini/voicePitch.js";
import { EMOTION_IDS, type EmotionId } from "../src/core/types.js";

type StreamingApiResponse = ApiResponse & {
  write(chunk: Uint8Array): boolean;
  end(): void;
  headersSent?: boolean;
};

type DeliveryPath = "generate-content-stream" | "generate-content-fallback";

function isEmotionId(value: unknown): value is EmotionId {
  return typeof value === "string" && (EMOTION_IDS as readonly string[]).includes(value);
}

function findAudioData(response: unknown): string | undefined {
  const value = response as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
  };
  for (const candidate of value.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) return part.inlineData.data;
    }
  }
  return undefined;
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
    const voicePitch = normalizeVoicePitch(body.voicePitch);
    const client = await createClient(normalizeClientApiKey(body.apiKey));
    const input = buildCharacterTtsPrompt(text, body.emotion, Number.isFinite(intensity) ? intensity : 0.7, voicePitch);

    let bytesWritten = 0;
    let responseStarted = false;
    const beginAudioResponse = (path: DeliveryPath) => {
      if (responseStarted) return;
      responseStarted = true;
      response.setHeader("Content-Type", "audio/pcm;rate=24000");
      response.setHeader("X-Audio-Sample-Rate", "24000");
      response.setHeader("X-Audio-Channels", "1");
      response.setHeader("X-Audio-Format", "s16le");
      response.setHeader("X-TTS-Delivery", path);
    };
    const writeAudio = (audio: Uint8Array, path: DeliveryPath) => {
      if (!audio.length) return;
      beginAudioResponse(path);
      bytesWritten += audio.length;
      streamingResponse.write(audio);
    };

    let streamError: unknown;
    try {
      const stream = await client.models.generateContentStream({
        model: GEMINI_31_TTS_MODEL,
        contents: [{ parts: [{ text: input }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: body.voiceName },
            },
          },
        },
      });

      for await (const chunk of stream) {
        const data = findAudioData(chunk);
        if (!data) continue;
        writeAudio(Buffer.from(data, "base64"), "generate-content-stream");
      }
    } catch (error) {
      streamError = error;
      if (bytesWritten > 0) throw error;
      console.warn("[deskpet:tts] Generate Content streaming failed before audio; retrying non-streaming", {
        model: GEMINI_31_TTS_MODEL,
        voiceName: body.voiceName,
        textLength: text.length,
        message: error instanceof Error ? error.message : "unknown streaming TTS error",
      });
    }

    if (!bytesWritten) {
      const fallback = await client.models.generateContent({
        model: GEMINI_31_TTS_MODEL,
        contents: [{ parts: [{ text: input }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: body.voiceName },
            },
          },
        },
      });
      const data = findAudioData(fallback);
      if (!data) {
        const streamingDetail = streamError instanceof Error ? ` Streaming error: ${streamError.message}` : "";
        throw new Error(`Gemini 3.1 Flash TTS가 오디오를 반환하지 않았습니다.${streamingDetail}`);
      }
      writeAudio(Buffer.from(data, "base64"), "generate-content-fallback");
    }

    if (!bytesWritten) throw new Error("Gemini 3.1 Flash TTS가 빈 오디오를 반환했습니다.");
    streamingResponse.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini TTS 스트리밍에 실패했습니다.";
    console.error("[deskpet:tts] TTS request failed", { message });
    if (!streamingResponse.headersSent) response.status(500).json({ error: message });
    else streamingResponse.end();
  }
}
