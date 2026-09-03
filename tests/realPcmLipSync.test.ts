import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("real PCM lip sync", () => {
  it("deploys the same fast PCM envelope worklet that AudioEngine loads in production", async () => {
    const sourceWorklet = await readFile(path.resolve("src/core/audio/worklets/playback-processor.js"), "utf8");
    const publicWorklet = await readFile(path.resolve("public/worklets/playback-processor.js"), "utf8");
    const engine = await readFile(path.resolve("src/core/audio/AudioEngine.ts"), "utf8");

    expect(publicWorklet).toBe(sourceWorklet);
    expect(publicWorklet).toContain("sampleRate * 0.02");
    expect(publicWorklet).toContain('event.data?.type === "pcm"');
    expect(publicWorklet).toContain('type: "playback-start"');
    expect(publicWorklet).toContain("this.emitLevel(0)");
    expect(publicWorklet).toContain("target > this.smoothedLevel ? 0.72 : 0.38");
    expect(engine).toContain('versionedWorkletUrl("playback-processor.js")');
    expect(engine).toContain('AUDIO_WORKLET_VERSION = "20260904-jitter-1"');
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

  it("does not serve audio worklets cache-first from the PWA service worker", async () => {
    const sw = await readFile(path.resolve("public/sw.js"), "utf8");
    expect(sw).toContain('CACHE_NAME = "deskpet-shell-v3"');
    expect(sw).toContain('url.pathname.startsWith("/worklets/")');
    expect(sw).toContain('fetch(request, { cache: "no-store" })');
  });
});