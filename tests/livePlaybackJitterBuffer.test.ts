import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANDROID_PLAYBACK_INITIAL_BUFFER_MS,
  ANDROID_PLAYBACK_REBUFFER_MS,
  DEFAULT_PLAYBACK_INITIAL_BUFFER_MS,
  DEFAULT_PLAYBACK_REBUFFER_MS,
} from "../src/core/audio/AudioEngine";

describe("Live PCM playback jitter buffering", () => {
  it("uses a larger low-latency cushion on Android", () => {
    expect(ANDROID_PLAYBACK_INITIAL_BUFFER_MS).toBeGreaterThanOrEqual(180);
    expect(ANDROID_PLAYBACK_INITIAL_BUFFER_MS).toBeLessThanOrEqual(300);
    expect(ANDROID_PLAYBACK_REBUFFER_MS).toBeGreaterThanOrEqual(100);
    expect(ANDROID_PLAYBACK_REBUFFER_MS).toBeLessThan(ANDROID_PLAYBACK_INITIAL_BUFFER_MS);
    expect(DEFAULT_PLAYBACK_INITIAL_BUFFER_MS).toBeLessThan(ANDROID_PLAYBACK_INITIAL_BUFFER_MS);
    expect(DEFAULT_PLAYBACK_REBUFFER_MS).toBeLessThan(ANDROID_PLAYBACK_REBUFFER_MS);
  });

  it("does not consume PCM until the startup or recovery target is buffered", async () => {
    const worklet = await readFile(path.resolve("src/core/audio/worklets/playback-processor.js"), "utf8");
    expect(worklet).toContain("this.availableSamples += pcm.length");
    expect(worklet).toContain("this.availableSamples = Math.max(0, this.availableSamples - 1)");
    expect(worklet).toContain("this.hasStartedOnce ? this.rebufferSamples : this.initialBufferSamples");
    expect(worklet).toContain("this.availableSamples >= target");
    expect(worklet).toContain("if (!this.committed) this.buffering = true");
  });

  it("lets final committed audio drain even when shorter than the jitter target", async () => {
    const worklet = await readFile(path.resolve("public/worklets/playback-processor.js"), "utf8");
    expect(worklet).toContain("if (this.committed) return this.availableSamples > 0 || this.haveCurrentSample");
    expect(worklet).toContain("this.committed && this.started && this.availableSamples === 0 && !this.haveCurrentSample");
    expect(worklet).toContain('this.port.postMessage({ type: "playback-end" })');
  });

  it("wires Android-specific jitter settings into the production worklet", async () => {
    const engine = await readFile(path.resolve("src/core/audio/AudioEngine.ts"), "utf8");
    expect(engine).toContain("initialBufferMs: android ? ANDROID_PLAYBACK_INITIAL_BUFFER_MS : DEFAULT_PLAYBACK_INITIAL_BUFFER_MS");
    expect(engine).toContain("rebufferMs: android ? ANDROID_PLAYBACK_REBUFFER_MS : DEFAULT_PLAYBACK_REBUFFER_MS");
    expect(engine).toContain('AUDIO_WORKLET_VERSION = "20260904-jitter-1"');
  });
});