import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pcm16ToWavBlob } from "../src/core/audio/AudioEngine";

describe("media playback routing and text chat", () => {
  it("wraps Gemini PCM in a playable WAV media payload", async () => {
    const blob = pcm16ToWavBlob(new Int16Array([0, 1000, -1000, 0]));
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(52);
  });

  it("routes model output through HTMLAudioElement instead of a playback AudioContext", async () => {
    const engine = await readFile(path.resolve("src/core/audio/AudioEngine.ts"), "utf8");
    expect(engine).toContain("new Audio()");
    expect(engine).toContain("commitBufferedPlayback");
    expect(engine).not.toContain('new AudioContext({ latencyHint: "playback" })');
  });

  it("sends typed chat through Gemini Live realtime text input", async () => {
    const adapter = await readFile(path.resolve("src/core/gemini/GeminiLiveAdapter.ts"), "utf8");
    const coordinator = await readFile(path.resolve("src/core/conversation/ConversationCoordinator.ts"), "utf8");
    const app = await readFile(path.resolve("src/renderer/App.tsx"), "utf8");
    expect(adapter).toContain("sendRealtimeInput({ text })");
    expect(coordinator).toContain("async sendText(text: string)");
    expect(app).toContain("<ChatPanel");
  });
});
