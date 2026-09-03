import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GEMINI_31_LIVE_MODEL,
  GEMINI_31_NATIVE_YOUTHFUL_MODE,
  isGemini31NativeYouthfulMode,
  resolveLiveModelId,
} from "../src/core/gemini/catalog";
import { buildSystemInstruction } from "../electron/personaVault";

describe("Gemini 3.1 animated mascot native voice mode", () => {
  it("is a virtual mode that resolves to the standard 3.1 Live socket", () => {
    expect(isGemini31NativeYouthfulMode(GEMINI_31_NATIVE_YOUTHFUL_MODE)).toBe(true);
    expect(resolveLiveModelId(GEMINI_31_NATIVE_YOUTHFUL_MODE)).toBe(GEMINI_31_LIVE_MODEL);
  });

  it("is exposed as a native-audio option and does not require external TTS", async () => {
    const modelsSource = await readFile(path.resolve("api/live-models.ts"), "utf8");
    expect(modelsSource).toContain("Gemini 3.1 Live · 애니메이션 마스코트 보이스");
    expect(modelsSource).toContain('supportedActions: ["bidi", "native-audio", "expression"]');
  });

  it("uses the dedicated animated mascot voice profile with native AUDIO", async () => {
    const tokenSource = await readFile(path.resolve("api/live-token.ts"), "utf8");
    expect(tokenSource).toContain('youthfulNative ? "animated-mascot" : "default"');
    expect(tokenSource).toContain("Native Animation Performance Guard");
    expect(tokenSource).toContain('responseModalities: ["AUDIO"]');
    expect(tokenSource).toContain("const externalTts = isGemini31ExpressiveTtsMode(requestedModelId)");
    expect(tokenSource).toContain("const youthfulNative = isGemini31NativeYouthfulMode(requestedModelId)");
  });

  it("steers away from mature narration while preserving an original mascot identity", () => {
    const prompt = buildSystemInstruction("greus-greeny", undefined, true, "animated-mascot");
    expect(prompt).toContain("Animated Mascot");
    expect(prompt).toContain("작고 가벼운 판타지 생명체");
    expect(prompt).toContain("head resonance");
    expect(prompt).toContain("forward placement");
    expect(prompt).toContain("vocal smile");
    expect(prompt).toContain("성숙한 내레이터");
    expect(prompt).toContain("pitch contour");
    expect(prompt).toContain("기존 작품의 특정 캐릭터나 실제 성우를 복제하지 않는");
  });
});
