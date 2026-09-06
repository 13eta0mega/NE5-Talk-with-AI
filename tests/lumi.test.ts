import { describe, expect, it } from "vitest";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMOTION_IDS, type EmotionId } from "../src/core/types";
import { CHARACTERS, characterById } from "../src/characters/catalog";
import { buildSystemInstruction, PERSONA_IDS } from "../electron/personaVault";
import { isCharacterId } from "../api/_shared";
import { Lumi } from "../src/renderer/components/Lumi";
import { LUMI_POSES, LUMI_ACTION_SECONDS, LUMI_ACTION_LABELS, actionPose, createLumiState, expressionPose, eyePath, mouthPath, mixPose, stepLumi, unit, type LumiInput } from "../src/renderer/components/lumiModel";

const input = (patch: Partial<LumiInput> = {}): LumiInput => ({ emotion: "idle", intensity: 1, phase: "disconnected", speechLevel: 0, microphoneLevel: 0, action: "none", reducedMotion: false, animated: true, gazeX: 0, gazeY: 0, ...patch });
const settle = (state: ReturnType<typeof createLumiState>, props: LumiInput, seconds = 2) => {
  let frame = stepLumi(state, props, 1 / 60);
  for (let i = 1; i < seconds * 60; i++) frame = stepLumi(state, props, 1 / 60);
  return frame;
};

describe("Lumi identity and integration", () => {
  it("adds one genuine new species while keeping all cat IDs and backend validation aligned", () => {
    expect(CHARACTERS.filter((c) => c.kind === "cat")).toHaveLength(5);
    expect(characterById("lumi").kind).toBe("lumi");
    expect(characterById("missing").id).toBe("greus-greeny");
    expect(CHARACTERS.map((c) => c.id)).toEqual([...PERSONA_IDS]);
    expect(isCharacterId("lumi")).toBe(true);
    expect(isCharacterId("unknown")).toBe(false);
  });
  it.each(["default", "animated-mascot"] as const)("has an independent server-side persona with the %s voice profile", (profile) => {
    const prompt = buildSystemInstruction("lumi", undefined, true, profile);
    expect(prompt).toContain("# Starlight Speech");
    expect(prompt).not.toContain("# Cat-like Speech");
    expect(prompt).not.toContain("\uace0\uc591\uc774");
    expect(prompt).toContain("set_pet_expression");
  });
  it("names all seven actions without removing the existing action protocol", () => {
    expect(Object.keys(LUMI_ACTION_LABELS)).toHaveLength(7);
    expect(Object.keys(LUMI_ACTION_SECONDS)).toHaveLength(8);
  });
  it("uses unique accessible SVG definitions when stage and thumbnail coexist", () => {
    const html = renderToStaticMarkup(createElement(Fragment, null,
      createElement(Lumi, { interactive: true }), createElement(Lumi, { interactive: false, animated: false })));
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html).toContain('data-part="rig-root"');
    expect(html).toContain('data-part="mouth"');
    expect(html.match(/role="button"/g)).toHaveLength(1);
    for (const match of html.matchAll(/url\(#([^)]*)\)/g)) expect(ids).toContain(match[1]);
  });
});

describe("Lumi continuous face rig", () => {
  it("defines 26 distinct numeric poses matching the public emotion protocol", () => {
    expect(Object.keys(LUMI_POSES)).toEqual([...EMOTION_IDS]);
    expect(new Set(Object.values(LUMI_POSES).map((p) => JSON.stringify(p))).size).toBe(26);
  });
  const pairs = EMOTION_IDS.flatMap((a) => EMOTION_IDS.map((b) => [a, b] as const));
  it.each(pairs)("morphs %s -> %s through finite, compatible paths", (a, b) => {
    for (const t of [0, .07, .25, .5, .83, 1]) {
      const p = mixPose(LUMI_POSES[a], LUMI_POSES[b], t);
      expect(Object.values(p).every(Number.isFinite)).toBe(true);
      const eye = eyePath(139, 176, p.eyeWidth, p.eyeL, p.curveL);
      const mouth = mouthPath(p.mouthWidth, p.smile, p.mouthOpen, p.mouthSkew);
      expect(eye.match(/[A-Z]/g)?.join("")).toBe("MCCZ");
      expect(mouth.match(/[A-Z]/g)?.join("")).toBe("MCCZ");
      expect(eye + mouth).not.toMatch(/NaN|Infinity/);
    }
    expect(mixPose(LUMI_POSES[a], LUMI_POSES[b], 1)).toEqual(LUMI_POSES[b]);
  });
  it("interpolates intensity and tolerates invalid public numeric inputs", () => {
    expect(expressionPose("angry", 0)).toEqual(LUMI_POSES.idle);
    expect(expressionPose("angry", 1)).toEqual(LUMI_POSES.angry);
    expect(expressionPose("angry", .5)).toEqual(mixPose(LUMI_POSES.idle, LUMI_POSES.angry, .5));
    for (const value of [NaN, Infinity, -Infinity, -1, 2]) {
      expect(Number.isFinite(unit(value))).toBe(true);
      const f = stepLumi(createLumiState(), input({ intensity: value, speechLevel: value, microphoneLevel: value, gazeX: value, phase: "speaking" }), value);
      expect(Object.values(f.pose).every(Number.isFinite)).toBe(true);
      expect(Number.isFinite(f.jaw)).toBe(true);
    }
  });
  it("continues from the current pose on rapid mid-transition retargeting", () => {
    const state = createLumiState();
    for (let i = 0; i < 260; i++) {
      const old = state.pose;
      const next = stepLumi(state, input({ emotion: EMOTION_IDS[i % 26] }), 1 / 120).pose;
      expect(Math.abs(next.tilt - old.tilt)).toBeLessThan(2);
      expect(Object.values(next).every(Number.isFinite)).toBe(true);
    }
  });
  it("has frame-rate-independent expression settling", () => {
    const a = createLumiState(), b = createLumiState();
    for (let i = 0; i < 30; i++) stepLumi(a, input({ emotion: "crying" }), 1 / 30);
    for (let i = 0; i < 120; i++) stepLumi(b, input({ emotion: "crying" }), 1 / 120);
    for (const key of Object.keys(a.pose) as (keyof typeof a.pose)[]) expect(a.pose[key]).toBeCloseTo(b.pose[key], 8);
  });
});

describe("Lumi motion, audio and accessibility", () => {
  it.each(Object.keys(LUMI_ACTION_LABELS) as (keyof typeof LUMI_ACTION_LABELS)[])("runs %s once, returns to rest, and does not retrigger", (action) => {
    const duration = LUMI_ACTION_SECONDS[action];
    expect(actionPose(action, 0)).toEqual({});
    expect(actionPose(action, duration)).toEqual({});
    expect(Object.values(actionPose(action, duration * .5)).some((v) => Math.abs(v) > .1)).toBe(true);
    const state = createLumiState();
    const frame = settle(state, input({ action }), duration + 2);
    expect(frame.action).toBe("none");
    expect(frame.pose.stretch).toBeCloseTo(1, 4);
    expect(frame.pose.armL).toBeCloseTo(0, 4);
    expect(frame.pose.armR).toBeCloseTo(0, 4);
    expect(settle(state, input({ action }), 4).action).toBe("none");
  });
  it.each(["listening", "thinking", "speaking", "connecting", "reconnecting"] as const)("interrupts idle actions for %s", (phase) => {
    const state = createLumiState();
    settle(state, input({ action: "yawn" }), 1);
    expect(state.action).toBe("yawn");
    const frame = settle(state, input({ action: "yawn", phase }));
    expect(frame.action).toBe("none");
    expect(frame.pose.mouthOpen).toBeLessThan(.001);
  });
  it("cycles automatic actions only while peacefully idle", () => {
    const state = createLumiState();
    settle(state, input({ action: "auto" }), 12.1);
    expect(state.action).toBe("air-punch");
    settle(state, input({ action: "auto", emotion: "crying" }), 20);
    expect(state.action).toBe("none");
  });
  it.each(["sad", "angry", "crying", "love"] as EmotionId[])("keeps %s eyes while PCM drives the mouth, and closes on silence", (emotion) => {
    const state = createLumiState(emotion);
    const speaking = input({ emotion, phase: "speaking", speechLevel: .64 });
    expect(settle(state, speaking).jaw).toBeCloseTo(.8, 3);
    expect(state.pose.eyeL).toBeCloseTo(LUMI_POSES[emotion].eyeL, 3);
    expect(settle(state, { ...speaking, speechLevel: 0 }).jaw).toBe(0);
    expect(settle(state, { ...speaking, phase: "listening" }).jaw).toBe(0);
  });
  it("only reacts to microphone input in the listening phase", () => {
    const state = createLumiState();
    expect(settle(state, input({ phase: "listening", microphoneLevel: 1 })).mic).toBeCloseTo(1, 3);
    expect(settle(state, input({ phase: "speaking", microphoneLevel: 1 })).mic).toBeLessThan(.001);
  });
  it("stops idle, bobbing, breathing, and blinking in reduced-motion and static previews", () => {
    for (const patch of [{ reducedMotion: true }, { animated: false }]) {
      const f = settle(createLumiState(), input({ ...patch, action: "stretch", emotion: "happy", gazeX: 1 }));
      expect([f.bob, f.breathe, f.blink, f.gazeX, f.time]).toEqual([0, 0, 0, 0, 0]);
      expect(f.action).toBe("none");
      expect(f.pose).toEqual(LUMI_POSES.happy);
    }
  });
});
