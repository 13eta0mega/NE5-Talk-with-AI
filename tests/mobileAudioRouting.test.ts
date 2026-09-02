import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ANDROID_AUDIO_MODE_SETTLE_MS, toBrowserSinkId } from "../src/core/audio/AudioEngine";

describe("mobile audio routing", () => {
  it("uses the browser-defined empty sink id for the system default output", () => {
    expect(toBrowserSinkId("default")).toBe("");
    expect(toBrowserSinkId("bluetooth-device")).toBe("bluetooth-device");
  });

  it("releases microphone capture before the first streaming output chunk and restores it after drain", async () => {
    const source = await readFile(path.resolve("src/core/conversation/ConversationCoordinator.ts"), "utf8");
    const audioCase = source.slice(source.indexOf('case "audio"'), source.indexOf('case "generation-complete"'));
    const drained = source.slice(source.indexOf("private async finishSpeakingWhenDrained"));

    expect(audioCase.indexOf("await this.enterPlaybackMode()")).toBeLessThan(audioCase.indexOf("await this.audio.enqueuePcm24k"));
    expect(drained.indexOf("await this.restoreListeningCapture()")).toBeLessThan(drained.indexOf("this.audio.gate.open()"));
  });

  it("keeps Android capture out of communication mode while using direct playback AudioContext streaming", async () => {
    const engine = await readFile(path.resolve("src/core/audio/AudioEngine.ts"), "utf8");
    const coordinator = await readFile(path.resolve("src/core/conversation/ConversationCoordinator.ts"), "utf8");
    const captureMethod = engine.slice(engine.indexOf("async startCapture"), engine.indexOf("async stopCapture"));
    const enqueueMethod = engine.slice(engine.indexOf("async enqueuePcm24k"), engine.indexOf("async commitBufferedPlayback"));

    expect(ANDROID_AUDIO_MODE_SETTLE_MS).toBeGreaterThanOrEqual(200);
    expect(captureMethod).toContain('this.setAudioSessionType(android ? "playback" : "auto")');
    expect(captureMethod).toContain("echoCancellation: android ? false : true");
    expect(captureMethod).toContain("noiseSuppression: android ? false : true");
    expect(captureMethod).toContain("autoGainControl: android ? false : true");
    expect(engine).toContain("async unlockPlayback()");
    expect(coordinator).toContain("await this.audio.unlockPlayback()");
    expect(engine).toContain('latencyHint: "interactive"');
    expect(enqueueMethod).toContain('postMessage({ type: "pcm"');
    expect(engine).not.toContain("pcm16ToWavBlob");
    expect(engine).not.toContain("URL.createObjectURL");
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
