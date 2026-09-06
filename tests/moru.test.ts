import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { EMOTION_IDS } from "../src/core/types";
import { CHARACTERS, MORU_ID, characterById } from "../src/characters/catalog";
import { buildSystemInstruction, PERSONA_IDS } from "../electron/personaVault";
import { bodyPath, clamp, eyePath, FACES, mixFace, MORU_ACTIONS, motionAt, mouthPath, restMotion, spring } from "../src/renderer/components/moru/rig";
const commands = (p: string) => p.match(/[A-Za-z]/g)?.join("");
const finite = (v: object) => Object.values(v).every(Number.isFinite);
describe("Moru silhouette and motion", () => {
  it("adds a rabbit while preserving five cats, their IDs and the default", () => {
    expect(CHARACTERS).toHaveLength(6);
    expect(CHARACTERS.slice(0, 5).every(c => c.id.startsWith("greus-"))).toBe(true);
    expect(characterById("").id).toBe("greus-greeny");
    expect(characterById(MORU_ID).displayName).toBe("\ubaa8\ub8e8");
    expect(CHARACTERS.map(c => c.id)).toEqual([...PERSONA_IDS]);
    expect(CHARACTERS.some(c => c.id.includes("lumi"))).toBe(false);
  });
  it("has an independent server persona and leaves the cat persona intact", () => {
    expect(buildSystemInstruction(MORU_ID)).toContain("# Rabbit-like Speech");
    expect(buildSystemInstruction(MORU_ID)).not.toContain("# Cat-like Speech");
    expect(buildSystemInstruction("greus-greeny")).toContain("# Cat-like Speech");
  });
  it.each(EMOTION_IDS)("%s has complete finite face parameters", emotion => {
    expect(finite(FACES[emotion])).toBe(true);
    expect(Object.keys(FACES[emotion])).toEqual(Object.keys(FACES.idle));
  });
  it("all 676 emotion pairs preserve topology at 21 interpolation samples", () => {
    for (const a of EMOTION_IDS) for (const b of EMOTION_IDS) for (let i = 0; i <= 20; i++) {
      const f = mixFace(FACES[a], FACES[b], i / 20);
      expect(finite(f)).toBe(true);
      const e = eyePath(137, f.left, f.arc, f.slant), m = mouthPath(f.mouth, f.width);
      expect(commands(e)).toBe(commands(eyePath(137, 1, 0, 0)));
      expect(commands(m)).toBe(commands(mouthPath(.65, 1)));
      expect(e + m + bodyPath(f.squash)).not.toMatch(/NaN|Infinity/);
    }
  });
  it("mouth crosses zero smile continuously", () => {
    const values = (v:number) => mouthPath(v,1).match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const a=values(-.0001), b=values(.0001);
    expect(Math.max(...a.map((v,i)=>Math.abs(v-b[i])))).toBeLessThan(.01);
  });
  it("all 26 face targets are distinct", () => expect(new Set(EMOTION_IDS.map(e => JSON.stringify(FACES[e]))).size).toBe(26));
  it.each(Object.keys(MORU_ACTIONS) as (keyof typeof MORU_ACTIONS)[])("%s has finite samples and returns to neutral", action => {
    const d = MORU_ACTIONS[action].seconds;
    expect(motionAt(action, 0)).toEqual(restMotion());
    for (let i = 0; i <= 200; i++) expect(finite(motionAt(action, i * d / 200))).toBe(true);
    expect(motionAt(action, d)).toEqual(restMotion());
    expect(motionAt(action, d + 1)).toEqual(restMotion());
  });
  it("deforms the body path and keeps its lower anchor", () => {
    expect(bodyPath(.7)).not.toEqual(bodyPath(0));
    expect(bodyPath(.7)).toContain("265");
    expect(bodyPath(-.5)).not.toEqual(bodyPath(.7));
  });
  it("ear springs overshoot then settle at different frame rates", () => {
    for (const dt of [1 / 120, 1 / 60, 1 / 20, 1]) {
      const s = { value: 0, velocity: 0 }; let peak = 0;
      for (let i = 0; i < 240; i++) { spring(s, 20, dt, 11, .5); peak = Math.max(peak, s.value); }
      expect(peak).toBeGreaterThan(20);
      for (let i = 0; i < 600; i++) spring(s, 0, dt, 11, .5);
      expect(Math.abs(s.value)).toBeLessThan(.001); expect(finite(s)).toBe(true);
    }
  });
  it("bounds non-finite and out-of-range inputs", () => {
    for (const v of [NaN, Infinity, -Infinity, -1]) expect(clamp(v)).toBe(0);
    expect(clamp(8)).toBe(1);
  });
  it("uses flat SVG artwork and cleans the animation lifecycle", async () => {
    const source = await readFile("src/renderer/components/MoruRabbit.tsx", "utf8");
    expect(source).not.toMatch(/<linearGradient|<radialGradient|<filter|<image/);
    expect(source).toContain('data-part="ear-tip"');
    expect(source).toContain('data-part="body"');
    expect(source).toContain('cancelAnimationFrame(frame)');
  });
});
