import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inferEmotionFromText } from "../src/core/emotion";
import { EMOTION_IDLE_RESET_MS, shouldResetEmotion } from "../src/renderer/emotionReset";

describe("emotion sync and listening lip sync", () => {
  it("infers empathetic expressions from Korean user speech and TTS text", () => {
    expect(inferEmotionFromText("오늘 너무 슬퍼. 정말 속상했어.")?.emotion).toBe("sad");
    expect(inferEmotionFromText("무서워서 잠을 못 잤어")?.emotion).toBe("scared");
    expect(inferEmotionFromText("와 진짜 너무 신나!")?.emotion).toBe("excited");
    expect(inferEmotionFromText("전혀 슬프지 않아")).toBeUndefined();
  });

  it("resets non-base emotion after five quiet seconds", () => {
    expect(EMOTION_IDLE_RESET_MS).toBe(5_000);
    expect(shouldResetEmotion({
      emotion: "sad",
      phase: "listening",
      inputLevel: 0,
      mouthLevel: 0,
      lastActivityAt: 1_000,
      now: 6_000,
    })).toBe(true);
  });

  it("keeps emotion while TTS is speaking, then allows the quiet reset", () => {
    expect(shouldResetEmotion({
      emotion: "sad",
      phase: "speaking",
      inputLevel: 0,
      mouthLevel: .4,
      lastActivityAt: 1_000,
      now: 20_000,
    })).toBe(false);
  });

  it("feeds transcript text into the expression fallback for both 2.5 and 3.1", async () => {
    const adapter = await readFile(path.resolve("src/core/gemini/GeminiLiveAdapter.ts"), "utf8");
    expect(adapter).toContain("inferEmotionFromText");
    expect(adapter).toContain("this.emitInferredExpression(inputText)");
    expect(adapter).toContain("this.emitInferredExpression(outputText)");
    expect(adapter).toContain("this.emitInferredExpression(text)");
    expect(adapter).toContain("Native tool output remains authoritative");
  });

  it("never lip-syncs in listening mode and falls back to idle motion if speech starts from listening", async () => {
    const stage = await readFile(path.resolve("src/renderer/components/PetStage.tsx"), "utf8");
    expect(stage).toContain('const speaking = phase === "speaking"');
    expect(stage).toContain('const listening = phase === "listening"');
    expect(stage).toContain('speaking && emotion === "listening" ? "idle" : emotion');
    expect(stage).toContain("microphoneActive={listening && !speaking}");
    expect(stage).toContain("isSpeaking={speaking}");
  });
});
