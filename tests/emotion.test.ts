import { describe, expect, it } from "vitest";
import { BASE_RIG, EMOTION_RIGS, interpolateRig } from "../src/core/emotion";
import { EMOTION_IDS } from "../src/core/types";

describe("emotion rig", () => {
  it("defines all 16 shared emotion ids", () => {
    expect(EMOTION_IDS).toHaveLength(16);
    expect(Object.keys(EMOTION_RIGS).sort()).toEqual([...EMOTION_IDS].sort());
  });

  it("interpolates happy to sad without a one-frame jump", () => {
    let current = { ...EMOTION_RIGS.happy };
    const target = EMOTION_RIGS.sad;
    let previousSmile = current.mouthSmile;
    for (let frame = 0; frame < 30; frame += 1) {
      current = interpolateRig(current, target, 0.12);
      expect(Math.abs(current.mouthSmile - previousSmile)).toBeLessThan(0.25);
      previousSmile = current.mouthSmile;
    }
    expect(current.mouthSmile).toBeLessThan(0);
  });

  it("keeps a complete numeric rig for every emotion", () => {
    const keys = Object.keys(BASE_RIG);
    for (const emotion of EMOTION_IDS) {
      expect(Object.keys(EMOTION_RIGS[emotion])).toEqual(keys);
      expect(Object.values(EMOTION_RIGS[emotion]).every(Number.isFinite)).toBe(true);
    }
  });
});
