import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("live PCM streaming and text chat", () => {
  it("streams Gemini PCM directly to a playback AudioWorklet without WAV or Blob conversion", async () => {
    const engine = await readFile(path.resolve("src/core/audio/AudioEngine.ts"), "utf8");
    const worklet = await readFile(path.resolve("src/core/audio/worklets/playback-processor.js"), "utf8");

    expect(engine).toContain('new AudioWorkletNode(context, "deskpet-playback"');
    expect(engine).toContain('postMessage({ type: "pcm"');
    expect(engine).not.toContain("pcm16ToWavBlob");
    expect(engine).not.toContain("URL.createObjectURL");
    expect(engine).not.toContain("new Audio()");
    expect(worklet).toContain('registerProcessor("deskpet-playback"');
    expect(worklet).toContain('type: "playback-start"');
    expect(worklet).toContain('type: "playback-end"');
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
