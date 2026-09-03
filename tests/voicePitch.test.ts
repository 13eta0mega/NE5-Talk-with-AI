import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCharacterTtsPrompt } from "../src/core/gemini/ttsVoiceDirector";
import {
  DEFAULT_VOICE_PITCH,
  normalizeVoicePitch,
  voicePitchDirectorNote,
  voicePitchSystemInstruction,
} from "../src/core/gemini/voicePitch";

describe("Gemini 3.1 relative voice pitch control", () => {
  it("bounds persisted pitch to five stable levels", () => {
    expect(DEFAULT_VOICE_PITCH).toBe(0);
    expect(normalizeVoicePitch(-20)).toBe(-2);
    expect(normalizeVoicePitch(-1.2)).toBe(-1);
    expect(normalizeVoicePitch(undefined)).toBe(0);
    expect(normalizeVoicePitch(1.4)).toBe(1);
    expect(normalizeVoicePitch(20)).toBe(2);
  });

  it("turns pitch levels into performance directions without changing speech rate", () => {
    expect(voicePitchSystemInstruction(0)).toBe("");
    expect(voicePitchSystemInstruction(2)).toContain("분명히 높이고");
    expect(voicePitchSystemInstruction(-2)).toContain("분명히 낮춘다");
    expect(voicePitchSystemInstruction(2)).toContain("말속도는 그대로 유지");
    expect(voicePitchDirectorNote(1)).toContain("살짝 높이고");
  });

  it("passes the same pitch bias into Gemini 3.1 expressive TTS prompts", () => {
    const high = buildCharacterTtsPrompt("안녕!", "happy", 0.8, 2);
    const low = buildCharacterTtsPrompt("안녕!", "happy", 0.8, -2);
    expect(high).toContain("분명히 높이고");
    expect(low).toContain("분명히 낮춘다");
    expect(high).toContain("말속도를 바꾸라는 뜻이 아니다");
  });

  it("wires the saved pitch through mobile settings, Live token, TTS, and settings UI", async () => {
    const [mobile, token, ttsApi, ttsAdapter, drawer] = await Promise.all([
      readFile(path.resolve("src/mobile/installMobileBridge.ts"), "utf8"),
      readFile(path.resolve("api/live-token.ts"), "utf8"),
      readFile(path.resolve("api/tts-stream.ts"), "utf8"),
      readFile(path.resolve("src/core/gemini/GeminiTtsAdapter.ts"), "utf8"),
      readFile(path.resolve("src/renderer/components/SettingsDrawer.tsx"), "utf8"),
    ]);
    expect(mobile).toContain("selectedVoicePitch");
    expect(mobile).toContain("voicePitch: request.voicePitch ?? settings.selectedVoicePitch");
    expect(token).toContain("voicePitchSystemInstruction");
    expect(token).toContain("const voicePitch = normalizeVoicePitch(body.voicePitch)");
    expect(ttsAdapter).toContain("voicePitch: this.voicePitchProvider()");
    expect(ttsApi).toContain("buildCharacterTtsPrompt(text, body.emotion");
    expect(drawer).toContain('htmlFor="voice-pitch"');
    expect(drawer).toContain("다음 Live 재연결부터 적용됩니다");
  });
});
