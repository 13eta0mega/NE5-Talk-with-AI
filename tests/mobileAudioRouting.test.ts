import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ANDROID_AUDIO_MODE_SETTLE_MS, toBrowserSinkId } from "../src/core/audio/AudioEngine";

describe("mobile audio routing", () => {
  it("uses the browser-defined empty sink id for the system default output", () => {
    expect(toBrowserSinkId("default")).toBe("");
    expect(toBrowserSinkId("bluetooth-device")).toBe("bluetooth-device");
  });

  it("gates microphone transport before streaming output and reopens it after drain without tearing capture down", async () => {
    const source = await readFile(path.resolve("src/core/conversation/ConversationCoordinator.ts"), "utf8");
    const engine = await readFile(path.resolve("src/core/audio/AudioEngine.ts"), "utf8");
    const audioCase = source.slice(source.indexOf('case "audio"'), source.indexOf('case "generation-complete"'));
    const playbackMode = source.slice(source.indexOf("private async enterPlaybackMode"), source.indexOf("private async restoreListeningCapture"));
    const reopen = source.slice(source.indexOf("private async reopenListening"), source.indexOf("async connect", source.indexOf("private async reopenListening")));
    const pauseCapture = engine.slice(engine.indexOf("async pauseCaptureForPlayback"), engine.indexOf("async preparePlayback"));

    expect(audioCase.indexOf("await this.enterPlaybackMode()")).toBeLessThan(audioCase.indexOf("await this.audio.enqueuePcm24k"));
    expect(playbackMode).toContain("this.audio.gate.close()");
    expect(playbackMode).toContain("this.provider.endInputAudio()");
    expect(reopen).toContain("await this.restoreListeningCapture()");
    expect(reopen).toContain("this.audio.gate.open()");
    expect(pauseCapture).not.toContain("stopCapture");
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
