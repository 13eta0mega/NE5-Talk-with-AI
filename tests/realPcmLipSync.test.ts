import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("real PCM lip sync", () => {
  it("emits a fast rendered PCM envelope and resets it during stream gaps", async () => {
    const worklet = await readFile(path.resolve("src/core/audio/worklets/playback-processor.js"), "utf8");
    expect(worklet).toContain("sampleRate * 0.02");
    expect(worklet).toContain("this.emitLevel(0)");
    expect(worklet).toContain("target > this.smoothedLevel ? 0.72 : 0.38");
  });

  it("keeps speaking stable for the whole playback session", async () => {
    const stage = await readFile(path.resolve("src/renderer/components/PetStage.tsx"), "utf8");
    expect(stage).toContain('const speaking = phase === "speaking"');
    expect(stage).toContain("isSpeaking={speaking}");
    expect(stage).not.toContain("isSpeaking={phase === \"speaking\" && audibleSpeechLevel");
  });

  it("maps PCM speechLevel directly to the mouth instead of a fake periodic animation", async () => {
    const css = await readFile(path.resolve("src/renderer/lipsync.css"), "utf8");
    const legacy = await readFile(path.resolve("src/renderer/components/greeny-animal.css"), "utf8");
    const main = await readFile(path.resolve("src/renderer/main.tsx"), "utf8");

    expect(main).toContain('import "./lipsync.css"');
    expect(css).toContain("animation: none !important");
    expect(css).toContain("translateY(var(--cat-mouth-open-y))");
    expect(css).toContain("scaleY(var(--cat-mouth-lip-open))");
    expect(css).toContain("transition: transform 32ms linear");
    expect(legacy).toContain("talk-mouth-slide 900ms");
  });
});
