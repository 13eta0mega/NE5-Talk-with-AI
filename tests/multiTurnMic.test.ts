import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("multi-turn microphone capture", () => {
  it("keeps getUserMedia alive while model audio plays", async () => {
    const engine = await readFile(path.resolve("src/core/audio/AudioEngine.ts"), "utf8");
    const start = engine.indexOf("async pauseCaptureForPlayback");
    const end = engine.indexOf("async preparePlayback", start);
    const playbackPause = engine.slice(start, end);

    expect(playbackPause).toContain("this.flushPlayback(false)");
    expect(playbackPause).toContain('this.setAudioSessionType("playback")');
    expect(playbackPause).not.toContain("stopCapture");
  });

  it("reuses a healthy microphone stream but reacquires a dead one", async () => {
    const engine = await readFile(path.resolve("src/core/audio/AudioEngine.ts"), "utf8");
    expect(engine).toContain("this.captureDeviceId === deviceId && this.captureActive");
    expect(engine).toContain('tracks.some((track) => track.readyState === "live")');
    expect(engine).toContain("await this.stopCapture()");
    expect(engine).toContain("navigator.mediaDevices.getUserMedia");
  });

  it("reopens the PCM gate after model playback drains", async () => {
    const coordinator = await readFile(path.resolve("src/core/conversation/ConversationCoordinator.ts"), "utf8");
    const start = coordinator.indexOf("private async finishSpeakingWhenDrained");
    const end = coordinator.indexOf("diagnostics()", start);
    const finish = coordinator.slice(start, end);

    expect(finish).toContain("await this.restoreListeningCapture()");
    expect(finish).toContain("this.audio.gate.open()");
    expect(finish).toContain('this.transition("PLAYBACK_DRAINED")');
  });
});
