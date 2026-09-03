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

type DeliveryPath = "interactions-stream" | "interactions-fallback" | "generate-content-fallback";

type InteractionAudio = {
  data: string;
  mimeType?: string;
  sampleRate?: number;
  channels?: number;
};

function isEmotionId(value: unknown): value is EmotionId {
  return typeof value === "string" && (EMOTION_IDS as readonly string[]).includes(value);
}

function findLegacyAudioData(response: unknown): string | undefined {
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

function findInteractionAudio(value: unknown): InteractionAudio | undefined {
  const response = value as {
    event_type?: string;
    type?: string;
    delta?: { type?: string; data?: string; mime_type?: string; sample_rate?: number; channels?: number };
    output_audio?: { data?: string; mime_type?: string; sample_rate?: number; channels?: number };
    interaction?: {
      output_audio?: { data?: string; mime_type?: string; sample_rate?: number; channels?: number };
      outputs?: Array<{ type?: string; data?: string; mime_type?: string; sample_rate?: number; channels?: number }>;
    };
    outputs?: Array<{ type?: string; data?: string; mime_type?: string; sample_rate?: number; channels?: number }>;
  };

  if ((response.event_type === "step.delta" || response.type === "step.delta") && response.delta?.type === "audio" && response.delta.data) {
    return {
      data: response.delta.data,
      mimeType: response.delta.mime_type,
      sampleRate: response.delta.sample_rate,
      channels: response.delta.channels,
    };
  }

  const direct = response.output_audio ?? response.interaction?.output_audio;
  if (direct?.data) {
    return { data: direct.data, mimeType: direct.mime_type, sampleRate: direct.sample_rate, channels: direct.channels };
  }

  for (const output of response.outputs ?? response.interaction?.outputs ?? []) {
    if (output.type === "audio" && output.data) {
      return { data: output.data, mimeType: output.mime_type, sampleRate: output.sample_rate, channels: output.channels };
    }
  }
  return undefined;
}

function validateInteractionAudio(audio: InteractionAudio): void {
  if (audio.channels !== undefined && audio.channels !== 1) {
    throw new Error(`Gemini TTS가 지원하지 않는 ${audio.channels}채널 오디오를 반환했습니다.`);
  }
  if (audio.sampleRate !== undefined && audio.sampleRate !== 24000) {
    throw new Error(`Gemini TTS가 예상과 다른 ${audio.sampleRate}Hz 오디오를 반환했습니다.`);
  }
  if (audio.mimeType && !["audio/l16", "audio/pcm", "audio/pcm;rate=24000"].includes(audio.mimeType.toLowerCase())) {
    throw new Error(`Gemini TTS가 PCM이 아닌 ${audio.mimeType} 형식을 반환했습니다.`);
  }
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

    const interactions = (client as unknown as { interactions?: { create(params: Record<string, unknown>): Promise<unknown> } }).interactions;
    let interactionsError: unknown;

    if (interactions?.create) {
      try {
        // Gemini's current TTS guide recommends the Interactions API for 3.1 TTS
        // streaming. It exposes audio deltas directly and avoids depending on the
        // legacy Generate Content streaming response shape.
        const stream = await interactions.create({
          model: GEMINI_31_TTS_MODEL,
          input,
          response_format: { type: "audio" },
          generation_config: {
            speech_config: [{ voice: body.voiceName, language: "ko-KR" }],
          },
          store: false,
          stream: true,
        });
        for await (const event of stream as AsyncIterable<unknown>) {
          const audio = findInteractionAudio(event);
          if (!audio) continue;
          validateInteractionAudio(audio);
          writeAudio(Buffer.from(audio.data, "base64"), "interactions-stream");
        }
      } catch (error) {
        interactionsError = error;
        if (bytesWritten > 0) throw error;
        console.warn("[deskpet:tts] Interactions streaming failed before audio; retrying non-streaming", {
          model: GEMINI_31_TTS_MODEL,
          voiceName: body.voiceName,
          textLength: text.length,
          message: error instanceof Error ? error.message : "unknown interactions streaming error",
        });
      }

      if (!bytesWritten) {
        try {
          const fallback = await interactions.create({
            model: GEMINI_31_TTS_MODEL,
            input,
            response_format: { type: "audio" },
            generation_config: {
              speech_config: [{ voice: body.voiceName, language: "ko-KR" }],
            },
            store: false,
            stream: false,
          });
          const audio = findInteractionAudio(fallback);
          if (audio) {
            validateInteractionAudio(audio);
            writeAudio(Buffer.from(audio.data, "base64"), "interactions-fallback");
          }
        } catch (error) {
          interactionsError = error;
          console.warn("[deskpet:tts] Interactions non-streaming TTS failed; retrying legacy Generate Content", {
            model: GEMINI_31_TTS_MODEL,
            voiceName: body.voiceName,
            textLength: text.length,
            message: error instanceof Error ? error.message : "unknown interactions fallback error",
          });
        }
      }
    }

    if (!bytesWritten) {
      // Final compatibility fallback. Generate Content remains supported by Google,
      // but is no longer the primary 3.1 TTS transport for this app.
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
      const data = findLegacyAudioData(fallback);
      if (!data) {
        const interactionsDetail = interactionsError instanceof Error ? ` Interactions error: ${interactionsError.message}` : "";
        throw new Error(`Gemini 3.1 Flash TTS가 오디오를 반환하지 않았습니다.${interactionsDetail}`);
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
