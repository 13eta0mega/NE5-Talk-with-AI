import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GeminiLiveAdapter } from "../src/core/gemini/GeminiLiveAdapter";
import { GeminiTtsAdapter, type ExpressiveTtsRequest, type TtsStreamer } from "../src/core/gemini/GeminiTtsAdapter";
import {
  GEMINI_31_EXPRESSIVE_TTS_MODE, GEMINI_31_LIVE_MODEL, GEMINI_31_TTS_MODEL,
  coerceConversationalLiveModel, isGemini31ExpressiveTtsMode, resolveLiveModelId,
} from "../src/core/gemini/catalog";
import { buildCharacterTtsPrompt, MAX_EXPRESSIVE_TTS_TEXT_LENGTH } from "../src/core/gemini/ttsVoiceDirector";
import type { ProviderEvent } from "../src/core/types";

describe("Gemini 3.1 Live + expressive TTS mode", () => {
  it("keeps a virtual selectable mode while resolving the Live socket to Gemini 3.1", () => {
    expect(isGemini31ExpressiveTtsMode(GEMINI_31_EXPRESSIVE_TTS_MODE)).toBe(true);
    expect(resolveLiveModelId(GEMINI_31_EXPRESSIVE_TTS_MODE)).toBe(GEMINI_31_LIVE_MODEL);
    expect(coerceConversationalLiveModel(GEMINI_31_EXPRESSIVE_TTS_MODE)).toBe(GEMINI_31_EXPRESSIVE_TTS_MODE);
    expect(GEMINI_31_TTS_MODEL).toBe("gemini-3.1-flash-tts-preview");
  });

  it("builds a bounded Korean animation-character voice direction without changing the transcript", () => {
    const transcript = "우와, 진짜 재밌겠다! 나도 같이 보고 싶어.";
    const prompt = buildCharacterTtsPrompt(transcript, "excited", 0.9);
    expect(prompt).toContain("한국 애니메이션 더빙 성우 스타일");
    expect(prompt).toContain("에너지 높고 반짝이는 느낌");
    expect(prompt).toContain(`<transcript>\n${transcript}\n</transcript>`);
    expect(prompt.match(new RegExp(transcript.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))).toHaveLength(1);

    const longPrompt = buildCharacterTtsPrompt("가".repeat(MAX_EXPRESSIVE_TTS_TEXT_LENGTH + 100), "happy", 0.7);
    const spoken = longPrompt.split("<transcript>\n")[1].split("\n</transcript>")[0];
    expect(spoken).toHaveLength(MAX_EXPRESSIVE_TTS_TEXT_LENGTH);
  });

  it("reassembles arbitrary HTTP byte boundaries into exact 16-bit PCM samples", async () => {
    let sentBody: Record<string, unknown> = {};
    const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body ?? "{}"));
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Uint8Array.from([1, 0, 2]));
          controller.enqueue(Uint8Array.from([0, 3, 0]));
          controller.close();
        },
      });
      return new Response(body, { status: 200, headers: { "Content-Type": "audio/pcm;rate=24000" } });
    }) as typeof fetch;
    const adapter = new GeminiTtsAdapter(fetcher, () => "test-api-key-value-long-enough-123456");
    const samples: number[] = [];
    await adapter.stream({
      text: "안녕!", characterId: "greus-greeny", voiceName: "Leda", emotion: "happy", intensity: 0.8,
    }, (pcm) => { samples.push(...pcm); });
    expect(samples).toEqual([1, 2, 3]);
    expect(sentBody.voiceName).toBe("Leda");
    expect(sentBody.emotion).toBe("happy");
    expect(sentBody.apiKey).toBe("test-api-key-value-long-enough-123456");
  });

  it("converts a completed 3.1 Live text turn into TTS PCM before publishing completion", async () => {
    const requests: ExpressiveTtsRequest[] = [];
    const fakeTts: TtsStreamer = {
      cancel() {},
      async stream(request, onChunk) {
        requests.push(request);
        await onChunk(new Int16Array([101, -202, 303]));
      },
    };
    const adapter = new GeminiLiveAdapter(fakeTts);
    const internal = adapter as any;
    internal.externalTtsMode = true;
    internal.activeModelId = GEMINI_31_LIVE_MODEL;
    internal.currentCharacterId = "greus-greeny";
    internal.currentVoiceName = "Leda";
    const events: ProviderEvent[] = [];
    adapter.onEvent((event) => events.push(event));

    internal.handleMessage({
      serverContent: {
        modelTurn: { parts: [{ text: "우와, 그거 정말 멋지다!" }] },
        turnComplete: true,
      },
    }, "greus-greeny", "Leda", GEMINI_31_EXPRESSIVE_TTS_MODE);
    await Promise.resolve();
    await Promise.resolve();

    expect(requests).toHaveLength(1);
    expect(requests[0].text).toBe("우와, 그거 정말 멋지다!");
    expect(requests[0].voiceName).toBe("Leda");
    const types = events.map((event) => event.type);
    expect(types).toContain("output-transcript");
    expect(types).toContain("audio");
    expect(types.indexOf("audio")).toBeLessThan(types.indexOf("generation-complete"));
    expect(types.indexOf("generation-complete")).toBeLessThan(types.indexOf("turn-complete"));
    const audio = events.find((event): event is Extract<ProviderEvent, { type: "audio" }> => event.type === "audio");
    expect(audio && [...audio.pcm]).toEqual([101, -202, 303]);
  });

  it("wires selection, constrained text Live mode, and official streaming TTS endpoint", async () => {
    const liveModelsSource = await readFile(path.resolve("api/live-models.ts"), "utf8");
    const liveTokenSource = await readFile(path.resolve("api/live-token.ts"), "utf8");
    const ttsSource = await readFile(path.resolve("api/tts-stream.ts"), "utf8");
    const liveSource = await readFile(path.resolve("src/core/gemini/GeminiLiveAdapter.ts"), "utf8");

    expect(liveModelsSource).toContain("GEMINI_31_EXPRESSIVE_TTS_MODE");
    expect(liveModelsSource).toContain("애니메이션 성우");
    expect(liveTokenSource).toContain('responseModalities: [externalTts ? "TEXT" : "AUDIO"]');
    expect(liveTokenSource).toContain("expressiveTtsSystemInstruction");
    expect(liveSource).toContain("Modality.TEXT");
    expect(liveSource).toContain("finalizeExternalTtsTurn");
    expect(ttsSource).toContain("client.interactions.create");
    expect(ttsSource).toContain("response_format: { type: \"audio\" }");
    expect(ttsSource).toContain("speech_config: [{ voice: body.voiceName }]");
    expect(ttsSource).toContain("stream: true");
    expect(ttsSource).toContain('"audio/pcm;rate=24000"');
  });
});
