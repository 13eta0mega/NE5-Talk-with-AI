import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GEMINI_31_LIVE_MODEL,
  GEMINI_31_NATIVE_YOUTHFUL_MODE,
  isGemini31NativeYouthfulMode,
  resolveLiveModelId,
} from "../src/core/gemini/catalog";

describe("Gemini 3.1 youthful native voice mode", () => {
  it("is a virtual mode that resolves to the standard 3.1 Live socket", () => {
    expect(isGemini31NativeYouthfulMode(GEMINI_31_NATIVE_YOUTHFUL_MODE)).toBe(true);
    expect(resolveLiveModelId(GEMINI_31_NATIVE_YOUTHFUL_MODE)).toBe(GEMINI_31_LIVE_MODEL);
  });

  it("is exposed as a native-audio option and does not require external TTS", async () => {
    const modelsSource = await readFile(path.resolve("api/live-models.ts"), "utf8");
    expect(modelsSource).toContain("Gemini 3.1 Live · 젊은 감정 캐릭터");
    expect(modelsSource).toContain('supportedActions: ["bidi", "native-audio", "expression"]');
  });

  it("adds strong youthful emotional acting instructions while keeping native AUDIO", async () => {
    const tokenSource = await readFile(path.resolve("api/live-token.ts"), "utf8");
    expect(tokenSource).toContain("youthfulNativeSystemInstruction");
    expect(tokenSource).toContain("10대 후반~아주 어린 청년 캐릭터");
    expect(tokenSource).toContain("모든 감정을 같은 차분한 톤으로 평준화하지 않는다");
    expect(tokenSource).toContain("Leda가 선택된 경우");
    expect(tokenSource).toContain('responseModalities: ["AUDIO"]');
    expect(tokenSource).toContain("const externalTts = isGemini31ExpressiveTtsMode(requestedModelId)");
    expect(tokenSource).toContain("const youthfulNative = isGemini31NativeYouthfulMode(requestedModelId)");
  });
});
