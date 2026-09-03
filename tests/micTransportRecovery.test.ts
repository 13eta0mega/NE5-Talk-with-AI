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
  it("detects a local speech end only after a long fallback silence", () => {
    expect(MIC_LOCAL_END_SILENCE_MS).toBeGreaterThan(900);
    const detector = new MicTurnDetector();
    expect(detector.feed(pcm(5000))).toBeUndefined();
    expect(detector.feed(pcm(5000))).toBeUndefined();
    expect(detector.feed(pcm(5000))).toBe("speech-start");
    let ended = false;
    for (let i = 0; i < 70; i += 1) {
      if (detector.feed(pcm(0)) === "speech-end") ended = true;
    }
    expect(ended).toBe(true);
  });

  it("uses the documented sensitive speech-start profile on client and token", async () => {
    const adapter = await readFile(path.resolve("src/core/gemini/GeminiLiveAdapter.ts"), "utf8");
    const token = await readFile(path.resolve("api/live-token.ts"), "utf8");
    for (const source of [adapter, token]) {
      expect(source).toContain('startOfSpeechSensitivity: "START_SENSITIVITY_HIGH"');
      expect(source).toContain("prefixPaddingMs: 120");
      expect(source).toContain("silenceDurationMs: 900");
      expect(source).toContain('activityHandling: "NO_INTERRUPTION"');
    }
  });

  it("flushes Gemini input audio on true local fallback and before model playback", async () => {
    const coordinator = await readFile(path.resolve("src/core/conversation/ConversationCoordinator.ts"), "utf8");
    expect(coordinator).toContain('signal === "speech-end"');
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
