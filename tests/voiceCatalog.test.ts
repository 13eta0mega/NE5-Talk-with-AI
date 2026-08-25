import { describe, expect, it } from "vitest";
import { VOICE_CATALOG } from "../src/core/gemini/catalog";

describe("Gemini voice catalog", () => {
  it("contains all 30 unique prebuilt voices", () => {
    expect(VOICE_CATALOG).toHaveLength(30);
    expect(new Set(VOICE_CATALOG.map(([name]) => name)).size).toBe(30);
  });
});
