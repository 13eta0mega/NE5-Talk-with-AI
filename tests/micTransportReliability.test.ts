import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MIC_LOCAL_END_SILENCE_MS,
  MicTurnDetector,
} from "../src/core/audio/MicTurnDetector";

function pcm(amplitude: number, samples = 320): Int16Array {
  return Int16Array.from({ length: samples }, (_, index) => {
    const sign = index % 2 === 0 ? 1 : -1;
    return Math.round(amplitude * 32767 * sign);
  });
}

describe("Gemini Live microphone transport reliability", () => {
  it("gives Gemini server VAD enough time for natural Korean pauses", async () => {
    const adapter = await readFile(path.resolve("src/core/gemini/GeminiLiveAdapter.ts"), "utf8");
    const token = await readFile(path.resolve("api/live-token.ts"), "utf8");
    for (const source of [adapter, token]) {
      expect(source).toContain('activityHandling: "NO_INTERRUPTION"');
      expect(source).toContain('startOfSpeechSensitivity: "START_SENSITIVITY_HIGH"');
      expect(source).toContain("prefixPaddingMs: 120");
      expect(source).toContain("silenceDurationMs: 900");
    }
  });

  it("never lets local VAD end speech before the 900ms server VAD window", () => {
    expect(MIC_LOCAL_END_SILENCE_MS).toBeGreaterThan(900);
    const detector = new MicTurnDetector();
    let startSeen = false;
    let endBeforeServerWindow = false;

    for (let i = 0; i < 10; i += 1) {
      if (detector.feed(pcm(0.08)) === "speech-start") startSeen = true;
    }
    for (let i = 0; i < 45; i += 1) {
      if (detector.feed(pcm(0)) === "speech-end") endBeforeServerWindow = true;
    }

    expect(startSeen).toBe(true);
    expect(endBeforeServerWindow).toBe(false);
  });

  it("still provides a long-silence local fallback after the server window", () => {
    const detector = new MicTurnDetector();
    for (let i = 0; i < 10; i += 1) detector.feed(pcm(0.08));
    let endSeen = false;
    for (let i = 0; i < 70; i += 1) {
      if (detector.feed(pcm(0)) === "speech-end") endSeen = true;
    }
    expect(endSeen).toBe(true);
  });

  it("ends realtime input when a true local fallback or playback ownership occurs", async () => {
    const coordinator = await readFile(path.resolve("src/core/conversation/ConversationCoordinator.ts"), "utf8");
    expect(coordinator).toContain('signal === "speech-end"');
    expect(coordinator).toContain("this.provider.endInputAudio()");
    expect(coordinator).toContain("private async enterPlaybackMode");
    expect(coordinator).toContain("stale VAD/audio cache across turns");
  });

  it("tracks raw PCM heartbeat and can force-restart a live-looking but stalled capture", async () => {
    const engine = await readFile(path.resolve("src/core/audio/AudioEngine.ts"), "utf8");
    const coordinator = await readFile(path.resolve("src/core/conversation/ConversationCoordinator.ts"), "utf8");
    expect(engine).toContain("lastCapturePcmAt");
    expect(engine).toContain("captureHeartbeatFresh");
    expect(engine).toContain("forceRestartCapture");
    expect(coordinator).toContain("MIC_HEALTH_CHECK_MS = 850");
    expect(coordinator).toContain("this.audio.captureHeartbeatFresh");
    expect(coordinator).toContain("this.audio.forceRestartCapture(this.microphoneDeviceId)");
  });

  it("keeps the microphone stream alive during TTS and only gates outgoing PCM", async () => {
    const engine = await readFile(path.resolve("src/core/audio/AudioEngine.ts"), "utf8");
    const start = engine.indexOf("async pauseCaptureForPlayback");
    const end = engine.indexOf("async preparePlayback", start);
    const pause = engine.slice(start, end);
    expect(pause).not.toContain("stopCapture");
    expect(pause).toContain('this.setAudioSessionType("playback")');
  });
});
