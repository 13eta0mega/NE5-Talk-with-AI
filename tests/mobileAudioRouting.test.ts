import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ANDROID_AUDIO_MODE_SETTLE_MS, toBrowserSinkId } from "../src/core/audio/AudioEngine";

describe("mobile audio routing", () => {
  it("uses the browser-defined empty sink id for the system default output", () => {
    expect(toBrowserSinkId("default")).toBe("");
    expect(toBrowserSinkId("bluetooth-device")).toBe("bluetooth-device");
  });

  it("releases microphone capture before playback and restores it before listening", async () => {
    const source = await readFile(path.resolve("src/core/conversation/ConversationCoordinator.ts"), "utf8");
    const audioCase = source.slice(source.indexOf('case "audio"'), source.indexOf('case "generation-complete"'));
    const drained = source.slice(source.indexOf("private async finishSpeakingWhenDrained"));

    expect(audioCase.indexOf("await this.enterPlaybackMode()")).toBeLessThan(audioCase.indexOf("await this.audio.enqueuePcm24k"));
    expect(drained.indexOf("await this.restoreListeningCapture()")).toBeLessThan(drained.indexOf("this.audio.gate.open()"));
  });

  it("keeps Android capture out of communication mode while preserving an unlocked reusable media element", async () => {
    const engine = await readFile(path.resolve("src/core/audio/AudioEngine.ts"), "utf8");
    const coordinator = await readFile(path.resolve("src/core/conversation/ConversationCoordinator.ts"), "utf8");
    const captureMethod = engine.slice(engine.indexOf("async startCapture"), engine.indexOf("async stopCapture"));
    const playbackMethod = engine.slice(engine.indexOf("async commitBufferedPlayback"), engine.indexOf("async waitForDrain"));

    expect(ANDROID_AUDIO_MODE_SETTLE_MS).toBeGreaterThanOrEqual(200);
    expect(captureMethod).toContain('this.setAudioSessionType(android ? "playback" : "auto")');
    expect(captureMethod).toContain("echoCancellation: android ? false : true");
    expect(captureMethod).toContain("noiseSuppression: android ? false : true");
    expect(captureMethod).toContain("autoGainControl: android ? false : true");
    expect(engine).toContain("async unlockPlayback()");
    expect(coordinator).toContain("await this.audio.unlockPlayback()");
    expect(playbackMethod).not.toContain("this.releasePlaybackElement()");
    expect(playbackMethod).toContain("element.muted = false");
    expect(playbackMethod).toContain("element.volume = 1");
    expect(engine).toContain("new Audio()");
    expect(engine).toContain("pcm16ToWavBlob");
    expect(engine).not.toContain('new AudioContext({ latencyHint: "playback" })');
  });

  it("offers the native output picker and requests the Vercel permissions policy", async () => {
    const engine = await readFile(path.resolve("src/core/audio/AudioEngine.ts"), "utf8");
    const settings = await readFile(path.resolve("src/renderer/components/SettingsDrawer.tsx"), "utf8");
    const vercel = await readFile(path.resolve("vercel.json"), "utf8");

    expect(engine).toContain("selectAudioOutput");
    expect(settings).toContain("출력 선택");
    expect(vercel).toContain("speaker-selection=(self)");
  });
});
