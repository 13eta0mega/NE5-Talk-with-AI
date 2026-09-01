import { describe, expect, it } from "vitest";
import { EMOTION_IDLE_RESET_MS, shouldResetEmotion } from "../src/renderer/emotionReset";

const quietSadState = {
  emotion: "sad" as const,
  phase: "listening" as const,
  inputLevel: 0,
  mouthLevel: 0,
  lastActivityAt: 1_000,
};

describe("emotion inactivity reset", () => {
  it("returns a lingering expression to idle after ten quiet seconds", () => {
    expect(shouldResetEmotion({ ...quietSadState, now: 1_000 + EMOTION_IDLE_RESET_MS })).toBe(true);
  });

  it("keeps the expression while speech or microphone activity is present", () => {
    expect(shouldResetEmotion({ ...quietSadState, phase: "speaking", now: 50_000 })).toBe(false);
    expect(shouldResetEmotion({ ...quietSadState, inputLevel: .2, now: 50_000 })).toBe(false);
  });

  it("never resets the base expression", () => {
    expect(shouldResetEmotion({ ...quietSadState, emotion: "idle", now: 50_000 })).toBe(false);
  });
});
