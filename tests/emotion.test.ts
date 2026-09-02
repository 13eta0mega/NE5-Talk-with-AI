import { describe, expect, it } from "vitest";
import { EMOTION_META, expressionFor } from "../src/core/emotion";
import { EMOTION_IDS, normalizeEmotionId } from "../src/core/types";
import { EMOTIONS } from "../src/renderer/components/GreusCat";

describe("Greus Cat emotions", () => {
  it("keeps all 26 Live API emotions synchronized with the SVG state machine", () => {
    expect(EMOTION_IDS).toHaveLength(26);
    expect(EMOTION_IDS).toEqual(EMOTIONS);
    expect(Object.keys(EMOTION_META)).toEqual([...EMOTION_IDS]);
  });

  it("normalizes sessions produced by the previous character system", () => {
    expect(normalizeEmotionId("neutral")).toBe("idle");
    expect(normalizeEmotionId("joyful")).toBe("laughing");
    expect(normalizeEmotionId("surprised")).toBe("startled");
    expect(normalizeEmotionId("unknown")).toBe("idle");
  });

  it("clamps expression intensity while preserving metadata", () => {
    expect(expressionFor("happy", 2).intensity).toBe(1);
    expect(expressionFor("sad", -1).intensity).toBe(0);
  });
});
