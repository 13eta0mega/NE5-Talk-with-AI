import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIC_LOCAL_END_SILENCE_MS, MicTurnDetector } from "../src/core/audio/MicTurnDetector";

function pcm(amplitude: number, samples = 320): Int16Array {
  const out = new Int16Array(samples);
  for (let i = 0; i < samples; i += 1) out[i] = i % 2 ? amplitude : -amplitude;
  return out;
}

describe("microphone transport recovery", () => {
  it("never turns local RMS silence into a Live speech-end", () => {
    expect(MIC_LOCAL_END_SILENCE_MS).toBeGreaterThan(900);
    const detector = new MicTurnDetector();
    expect(detector.feed(pcm(5000))).toBeUndefined();
    expect(detector.feed(pcm(5000))).toBeUndefined();
    expect(detector.feed(pcm(5000))).toBe("speech-start");
    for (let i = 0; i < 250; i += 1) {
      expect(detector.feed(pcm(0))).not.toBe("speech-end");
    }
    expect(detector.diagnostics().silenceMs).toBeGreaterThan(4000);
  });

  it("survives 100 simulated 30-second idle/noise microphone sessions without a false turn end", () => {
    for (let run = 0; run < 100; run += 1) {
      const detector = new MicTurnDetector();
      let falseEnd = false;
      for (let chunk = 0; chunk < 1500; chunk += 1) {
        // 20 ms chunks: mostly silence with brief low-level device/background spikes.
        const amplitude = chunk % 173 === 0 || chunk % 277 === 0 ? 420 : 0;
        if (detector.feed(pcm(amplitude)) === "speech-end") falseEnd = true;
      }
      expect(falseEnd).toBe(false);
    }
  });

  it("does not convert a false local speech-start followed by 30 seconds of silence into thinking input", () => {
    const detector = new MicTurnDetector();
    expect(detector.feed(pcm(5000))).toBeUndefined();
    expect(detector.feed(pcm(5000))).toBeUndefined();
    expect(detector.feed(pcm(5000))).toBe("speech-start");
    for (let chunk = 0; chunk < 1500; chunk += 1) {
      expect(detector.feed(pcm(0))).not.toBe("speech-end");
    }
  });

  it("uses the documented server VAD profile on client and token", async () => {
    const adapter = await readFile(path.resolve("src/core/gemini/GeminiLiveAdapter.ts"), "utf8");
    const token = await readFile(path.resolve("api/live-token.ts"), "utf8");
    for (const source of [adapter, token]) {
      expect(source).toContain('startOfSpeechSensitivity: "START_SENSITIVITY_HIGH"');
      expect(source).toContain("prefixPaddingMs: 120");
      expect(source).toContain("silenceDurationMs: 900");
      expect(source).toContain('activityHandling: "NO_INTERRUPTION"');
    }
  });

  it("keeps explicit input flushes for user stop and model playback only", async () => {
    const detector = await readFile(path.resolve("src/core/audio/MicTurnDetector.ts"), "utf8");
    const coordinator = await readFile(path.resolve("src/core/conversation/ConversationCoordinator.ts"), "utf8");
    expect(detector).toContain('never return "speech-end"');
    expect(coordinator).toContain("this.provider.endInputAudio()");
    const playback = coordinator.slice(coordinator.indexOf("private async enterPlaybackMode"), coordinator.indexOf("private async restoreListeningCapture"));
    expect(playback).toContain("this.provider.endInputAudio()");
  });

  it("does not call a live track healthy unless PCM heartbeat is fresh", async () => {
    const engine = await readFile(path.resolve("src/core/audio/AudioEngine.ts"), "utf8");
    const app = await readFile(path.resolve("src/renderer/App.tsx"), "utf8");
    expect(engine).toContain("CAPTURE_HEARTBEAT_FRESH_MS = 700");
    expect(engine).toContain("get captureHeartbeatFresh(): boolean");
    expect(engine).toContain("lastCapturePcmAt");
    expect(app).toContain("coordinator.audio.captureHeartbeatFresh");
  });

  it("rebuilds a stalled Android capture pipeline instead of silently staying ready", async () => {
    const coordinator = await readFile(path.resolve("src/core/conversation/ConversationCoordinator.ts"), "utf8");
    const engine = await readFile(path.resolve("src/core/audio/AudioEngine.ts"), "utf8");
    expect(coordinator).toContain("MIC_HEALTH_CHECK_MS = 850");
    expect(coordinator).toContain("MAX_MIC_PIPELINE_RECOVERIES = 2");
    expect(coordinator).toContain("if (this.audio.captureHeartbeatFresh)");
    expect(coordinator).toContain("this.audio.forceRestartCapture(this.microphoneDeviceId)");
    expect(engine).toContain("async forceRestartCapture");
  });
});
