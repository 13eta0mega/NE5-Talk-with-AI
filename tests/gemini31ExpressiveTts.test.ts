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
    expect(prompt.split(transcript)).toHaveLength(2);

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
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "audio/pcm;rate=24000",
          "X-TTS-Delivery": "interactions-stream",
          "X-Audio-Sample-Rate": "24000",
        },
      });
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

  it("mutes native Live audio when separate expressive TTS succeeds", async () => {
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
        modelTurn: { parts: [{ inlineData: { data: "AQACAA==" } }] },
        outputTranscription: { text: "우와, 그거 정말 멋지다!" },
      },
    }, "greus-greeny", "Leda", GEMINI_31_EXPRESSIVE_TTS_MODE);

    expect(requests).toHaveLength(0);
    internal.finalizeExternalTtsTurn();
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
    const audioEvents = events.filter((event): event is Extract<ProviderEvent, { type: "audio" }> => event.type === "audio");
    expect(audioEvents).toHaveLength(1);
    expect([...audioEvents[0].pcm]).toEqual([101, -202, 303]);
  });

  it("replays buffered native Live audio instead of silence when expressive TTS fails before PCM", async () => {
    const fakeTts: TtsStreamer = {
      cancel() {},
      async stream() { throw new Error("synthetic TTS failure"); },
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
        modelTurn: { parts: [{ inlineData: { data: "AQACAA==" } }] },
        outputTranscription: { text: "대체 재생 테스트" },
      },
    }, "greus-greeny", "Leda", GEMINI_31_EXPRESSIVE_TTS_MODE);
    internal.finalizeExternalTtsTurn();
    await Promise.resolve();
    await Promise.resolve();

    const audioEvents = events.filter((event): event is Extract<ProviderEvent, { type: "audio" }> => event.type === "audio");
    expect(audioEvents).toHaveLength(1);
    expect([...audioEvents[0].pcm]).toEqual([1, 2]);
    const ttsError = events.find((event): event is Extract<ProviderEvent, { type: "tts-error" }> => event.type === "tts-error");
    expect(ttsError?.message).toContain("Live 기본 음성으로 대체 재생했습니다");
    expect(events.map((event) => event.type)).toContain("turn-complete");
  });

  it("uses current Interactions streaming TTS with bounded compatibility fallbacks", async () => {
    const liveModelsSource = await readFile(path.resolve("api/live-models.ts"), "utf8");
    const liveTokenSource = await readFile(path.resolve("api/live-token.ts"), "utf8");
    const ttsSource = await readFile(path.resolve("api/tts-stream.ts"), "utf8");
    const liveSource = await readFile(path.resolve("src/core/gemini/GeminiLiveAdapter.ts"), "utf8");
    const ttsClientSource = await readFile(path.resolve("src/core/gemini/GeminiTtsAdapter.ts"), "utf8");

    expect(liveModelsSource).toContain("GEMINI_31_EXPRESSIVE_TTS_MODE");
    expect(liveModelsSource).toContain("애니메이션 성우");
    expect(liveTokenSource).toContain('responseModalities: ["AUDIO"]');
    expect(liveTokenSource).toContain("outputAudioTranscription: transcription");
    expect(liveTokenSource).toContain("expressiveTtsSystemInstruction");
    expect(liveTokenSource).not.toContain('externalTts ? "TEXT" : "AUDIO"');
    expect(liveSource).toContain("responseModalities: [Modality.AUDIO]");
    expect(liveSource).toContain("outputAudioTranscription: transcription");
    expect(liveSource).not.toContain("Modality.TEXT");
    expect(liveSource).toContain("outputTranscription?.text");
    expect(liveSource).toContain("bufferExternalTtsFallbackAudio");
    expect(liveSource).toContain("emitExternalTtsFallbackAudio");
    expect(liveSource).toContain("externalTtsFinalizePending");

    expect(ttsSource).toContain("interactions?.create");
    expect(ttsSource).toContain('response_format: { type: "audio" }');
    expect(ttsSource).toContain('speech_config: [{ voice: body.voiceName, language: "ko-KR" }]');
    expect(ttsSource).toContain("store: false");
    expect(ttsSource).toContain("stream: true");
    expect(ttsSource).toContain("interactions-stream");
    expect(ttsSource).toContain("interactions-fallback");
    expect(ttsSource).toContain("client.models.generateContent({");
    expect(ttsSource).not.toContain("client.models.generateContentStream");
    expect(ttsSource).toContain("generate-content-fallback");
    expect(ttsSource).toContain('"audio/pcm;rate=24000"');
    expect(ttsClientSource).toContain('response.headers.get("X-TTS-Delivery")');
    expect(ttsClientSource).toContain('event: "audio-complete"');
  });
});
