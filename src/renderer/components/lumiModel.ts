import type { ConversationPhase, EmotionId } from "../../core/types";
import type { IdleAction } from "./GreusCat";

/** A numeric, fixed-topology rig. No CSS path morphs or expression crossfades. */
export interface LumiPose {
  eyeL: number; eyeR: number; eyeWidth: number; curveL: number; curveR: number;
  eyeTiltL: number; eyeTiltR: number; browL: number; browR: number; browTilt: number;
  mouthWidth: number; smile: number; mouthOpen: number; mouthSkew: number;
  tilt: number; lift: number; stretch: number; armL: number; armR: number; armLX: number; armLY: number; armRX: number; armRY: number; comet: number;
  blush: number; tears: number; hearts: number; sparkle: number; worry: number; glow: number;
}
const BASE: LumiPose = {
  eyeL: 5.5, eyeR: 5.5, eyeWidth: 3.7, curveL: 0, curveR: 0,
  eyeTiltL: 0, eyeTiltR: 0, browL: 0, browR: 0, browTilt: 0,
  mouthWidth: 5, smile: 2.6, mouthOpen: 0, mouthSkew: 0,
  tilt: -2, lift: 0, stretch: 1, armL: 0, armR: 0, armLX: 0, armLY: 0, armRX: 0, armRY: 0, comet: 0,
  blush: .35, tears: 0, hearts: 0, sparkle: .15, worry: 0, glow: .5,
};
const pose = (patch: Partial<LumiPose>): LumiPose => ({ ...BASE, ...patch });
export const LUMI_POSES: Record<EmotionId, LumiPose> = {
  idle: pose({}),
  listening: pose({ eyeL: 6.1, eyeR: 6.1, tilt: -6, lift: -2, armL: -10, glow: .72 }),
  happy: pose({ eyeL: .35, eyeR: .35, eyeWidth: 6, curveL: -5, curveR: -5, smile: 8, mouthOpen: 2, blush: .8, glow: .85 }),
  sleepy: pose({ eyeL: .25, eyeR: .25, eyeWidth: 5.6, curveL: 3, curveR: 3, tilt: 9, lift: 5, stretch: .96, mouthWidth: 2.8, mouthOpen: 1, glow: .22 }),
  curious: pose({ eyeL: 6.6, eyeR: 7, tilt: -12, browR: .55, mouthWidth: 3, mouthOpen: 2, smile: 0, glow: .7 }),
  alert: pose({ eyeL: 7.1, eyeR: 7.1, browL: .35, browR: .35, tilt: 0, lift: -5, stretch: 1.035, armL: -16, armR: 16, smile: 0, glow: .8 }),
  playful: pose({ eyeL: .35, curveL: -4, eyeR: 5.7, tilt: 9, armR: -25, smile: 6, mouthOpen: 3, mouthSkew: 2, blush: .65, sparkle: .55 }),
  excited: pose({ eyeL: 7.3, eyeR: 7.3, eyeWidth: 4.8, mouthWidth: 7, mouthOpen: 7, smile: 4, lift: -9, armL: 55, armR: -55, blush: .9, sparkle: 1, glow: 1 }),
  affectionate: pose({ eyeL: 2, eyeR: 2, curveL: -3, curveR: -3, tilt: -7, blush: 1, armL: -22, armR: 22, hearts: .45, glow: .9, smile: 6 }),
  relaxed: pose({ eyeL: .3, eyeR: .3, eyeWidth: 5.5, curveL: 2.5, curveR: 2.5, stretch: .97, lift: 3, smile: 5, armL: 12, armR: -12, glow: .55 }),
  startled: pose({ eyeL: 8.8, eyeR: 8.8, eyeWidth: 4.8, mouthWidth: 4.5, mouthOpen: 8, smile: 0, lift: -12, stretch: 1.06, armL: 36, armR: -36, blush: .1, sparkle: .75, glow: .95 }),
  anxious: pose({ eyeL: 5, eyeR: 5.3, browL: .9, browR: .9, browTilt: -4, tilt: -4, mouthWidth: 4.5, smile: -3, mouthSkew: -1, armL: -28, armR: 28, worry: .8, glow: .35 }),
  annoyed: pose({ eyeL: 1.8, eyeR: 1.8, eyeWidth: 5.3, eyeTiltL: 8, eyeTiltR: -8, browL: .55, browR: .55, browTilt: 3, smile: -1, tilt: 5, blush: .15, glow: .35 }),
  angry: pose({ eyeL: 2.8, eyeR: 2.8, eyeWidth: 5.2, eyeTiltL: 20, eyeTiltR: -20, browL: 1, browR: 1, browTilt: 5, smile: -5, mouthWidth: 6.5, armL: -35, armR: 35, blush: 1, stretch: 1.02, glow: .9 }),
  sad: pose({ eyeL: 3.5, eyeR: 3.5, eyeTiltL: -9, eyeTiltR: 9, browL: .8, browR: .8, browTilt: -4, smile: -5, tilt: -5, lift: 6, stretch: .965, blush: .15, glow: .2 }),
  scared: pose({ eyeL: 8, eyeR: 8, eyeWidth: 3, browL: 1, browR: 1, browTilt: -5, mouthWidth: 3.5, mouthOpen: 5, smile: -2, stretch: .94, armL: -38, armR: 38, worry: 1, glow: .3 }),
  laughing: pose({ eyeL: .3, eyeR: .3, eyeWidth: 6.5, curveL: -6, curveR: -6, mouthWidth: 8, mouthOpen: 8, smile: 6, tilt: -6, lift: -3, armL: 16, armR: -16, blush: .9, sparkle: .5, glow: .95 }),
  love: pose({ eyeL: 4.5, eyeR: 4.5, eyeWidth: 4, smile: 6, mouthOpen: 2, hearts: 1, blush: 1, tilt: 7, armL: -28, armR: 28, glow: 1 }),
  wink: pose({ eyeL: 5.8, eyeR: .3, eyeWidth: 4.7, curveR: -5, smile: 5, mouthSkew: 2, tilt: -9, armR: -38, blush: .8, sparkle: .7, glow: .8 }),
  proud: pose({ eyeL: .45, eyeR: .45, eyeWidth: 5.5, curveL: -3, curveR: -3, smile: 6, lift: -6, stretch: 1.035, armL: -18, armR: 18, sparkle: .8, glow: .85 }),
  smug: pose({ eyeL: 1.5, eyeR: 2.2, eyeWidth: 5, eyeTiltL: -7, eyeTiltR: -7, smile: 4, mouthSkew: 4, tilt: 8, browR: .4, blush: .5, glow: .7 }),
  thinking: pose({ eyeL: 3.8, eyeR: 4.8, browR: .7, tilt: -11, mouthWidth: 3.5, smile: 0, mouthSkew: -3, armR: -145, armRX: -16, armRY: -4, glow: .65 }),
  confused: pose({ eyeL: 6, eyeR: 2.8, browL: .75, browR: .3, browTilt: -2, tilt: 13, smile: -2, mouthSkew: 3, worry: .45, armL: 25, glow: .6 }),
  disappointed: pose({ eyeL: 1.5, eyeR: 1.5, eyeWidth: 5, browL: .35, browR: .35, browTilt: -2, smile: -4, lift: 9, stretch: .94, armL: 8, armR: -8, blush: .1, glow: .18 }),
  tired: pose({ eyeL: 1, eyeR: 1.6, curveL: 1, curveR: 1, eyeWidth: 5, tilt: 12, lift: 7, stretch: .945, mouthWidth: 5.8, smile: 0, blush: .1, glow: .15 }),
  crying: pose({ eyeL: .3, eyeR: .3, eyeWidth: 5.5, curveL: -2.5, curveR: -2.5, browL: 1, browR: 1, browTilt: -5, mouthWidth: 7, mouthOpen: 4, smile: -6, tears: 1, lift: 5, stretch: .96, armL: -12, armR: 12, glow: .25 }),
};
export const LUMI_ACTION_LABELS: Record<Exclude<IdleAction, "none">, string> = {
  "air-punch": "별빛 인사", sleep: "별 품고 잠들기",
  stretch: "쭈욱 늘어나기", groom: "반짝 세수",
  yawn: "하품 방울", knead: "별빛 토닥토닥",
  butterfly: "별똥별 따라가기",
};
export const LUMI_ACTION_SECONDS: Record<IdleAction, number> = {
  none: 0, "air-punch": 3.8, sleep: 8, stretch: 4.6, groom: 5.6, yawn: 4.8, knead: 5.8, butterfly: 6.4,
};
const AUTO_ACTIONS: Exclude<IdleAction, "none">[] = ["air-punch", "stretch", "knead", "butterfly", "groom", "yawn", "sleep"];
export function unit(value: number, fallback = 0): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}
export function mixPose(a: LumiPose, b: LumiPose, amount: number): LumiPose {
  const t = unit(amount);
  if (t === 0) return { ...a };
  if (t === 1) return { ...b };
  const result = { ...a };
  for (const key of Object.keys(a) as (keyof LumiPose)[]) result[key] += (b[key] - a[key]) * t;
  return result;
}
export function expressionPose(emotion: EmotionId, intensity = 1): LumiPose {
  return mixPose(BASE, LUMI_POSES[emotion] ?? BASE, unit(intensity, 1));
}
/** All one-shots have zero displacement at BOTH endpoints. */
export function actionPose(action: IdleAction, seconds: number): Partial<LumiPose> {
  const duration = LUMI_ACTION_SECONDS[action];
  if (!duration || seconds <= 0 || seconds >= duration) return {};
  const p = seconds / duration;
  const w = Math.sin(Math.PI * p) ** 2;
  const wave = Math.sin(p * Math.PI * 8);
  switch (action) {
    case "air-punch": return { armR: (-65 + wave * 22) * w, tilt: -7 * w, lift: -4 * w, sparkle: .6 * w };
    case "sleep": return { eyeL: -5.2 * w, eyeR: -5.2 * w, curveL: 3 * w, curveR: 3 * w, lift: 13 * w, stretch: -.09 * w, tilt: 12 * w, armL: -25 * w, armR: 25 * w, glow: -.25 * w };
    case "stretch": return { stretch: .14 * w, lift: -13 * w, armL: 95 * w, armR: -95 * w, eyeL: -5.2 * w, eyeR: -5.2 * w, curveL: -4 * w, curveR: -4 * w, smile: 4 * w };
    case "groom": return { armL: (128 + wave * 10) * w, armLX: 20 * w, armLY: -7 * w, tilt: 8 * w, eyeL: -5.2 * w, curveL: -4 * w, sparkle: .8 * w };
    case "yawn": return { mouthOpen: 10 * w, mouthWidth: 2 * w, smile: -2.6 * w, eyeL: -5.2 * w, eyeR: -5.2 * w, curveL: 2 * w, curveR: 2 * w, tilt: -8 * w, armR: 62 * w };
    case "knead": return { armLX: 29 * w, armRX: -29 * w, armLY: -8 * w, armRY: -8 * w, armL: (-35 + wave * 18) * w, armR: (35 + wave * 18) * w, lift: Math.sin(p * Math.PI * 8) * 2 * w, stretch: -.025 * w, glow: .4 * w, smile: 3 * w };
    case "butterfly": return { comet: w, tilt: Math.sin(p * Math.PI * 2) * 14 * w, lift: -9 * w, armL: 35 * w, armR: -40 * w, sparkle: .8 * w, eyeL: w, eyeR: w };
    default: return {};
  }
}
export interface LumiInput {
  emotion: EmotionId; intensity: number; phase: ConversationPhase;
  speechLevel: number; microphoneLevel: number; action: IdleAction | "auto";
  reducedMotion: boolean; animated: boolean; gazeX: number; gazeY: number;
}
export interface LumiState {
  pose: LumiPose; time: number; action: IdleAction; actionTime: number; requestedAction: string;
  autoTime: number; autoIndex: number; jaw: number; mic: number; pet: number; gazeX: number; gazeY: number;
}
export function createLumiState(emotion: EmotionId = "idle", intensity = 1): LumiState {
  return { pose: expressionPose(emotion, intensity), time: 0, action: "none", actionTime: 0,
    requestedAction: "auto", autoTime: 0, autoIndex: 0, jaw: 0, mic: 0, pet: 0, gazeX: 0, gazeY: 0 };
}
export interface LumiFrame {
  pose: LumiPose; time: number; bob: number; breathe: number; blink: number;
  jaw: number; mic: number; pet: number; gazeX: number; gazeY: number; action: IdleAction;
}
/** Frame-rate-independent damping; rendered PCM alone opens the speaking mouth. */
export function stepLumi(state: LumiState, input: LumiInput, delta: number): LumiFrame {
  const dt = Number.isFinite(delta) ? Math.max(0, Math.min(.064, delta)) : 0;
  const moving = input.animated && !input.reducedMotion;
  const busy = !["disconnected", "idle", "error"].includes(input.phase);
  const canIdle = !busy && ["idle", "relaxed", "sleepy"].includes(input.emotion);
  if (moving) state.time += dt;
  if (state.requestedAction !== input.action) {
    state.requestedAction = input.action;
    state.action = input.action === "auto" ? "none" : input.action;
    state.actionTime = 0; state.autoTime = 0;
  }
  if (!moving || !canIdle) { state.action = "none"; state.autoTime = 0; }
  else if (state.action !== "none") {
    state.actionTime += dt;
    if (state.actionTime >= LUMI_ACTION_SECONDS[state.action]) { state.action = "none"; state.autoTime = 0; }
  } else if (input.action === "auto") {
    state.autoTime += dt;
    if (state.autoTime >= 12) {
      state.action = AUTO_ACTIONS[state.autoIndex++ % AUTO_ACTIONS.length];
      state.actionTime = 0; state.autoTime = 0;
    }
  }
  const target = expressionPose(input.emotion, input.intensity);
  const offset = actionPose(state.action, state.actionTime);
  for (const key of Object.keys(offset) as (keyof LumiPose)[]) target[key] += offset[key] ?? 0;
  state.pet = Math.max(0, state.pet - dt / 1.1);
  if (state.pet > 0 && !busy) {
    const weight = Math.sin(Math.PI * state.pet) ** 2;
    target.blush += .5 * weight; target.hearts += .6 * weight; target.smile += 3 * weight;
    target.stretch -= .035 * weight; target.glow += .4 * weight;
  }
  const blend = moving ? 1 - Math.exp(-dt / .13) : 1;
  state.pose = mixPose(state.pose, target, blend);
  const speech = input.phase === "speaking" ? unit(input.speechLevel) : 0;
  const jawTarget = speech >= .012 ? Math.sqrt(speech) : 0;
  state.jaw = moving ? state.jaw + (jawTarget - state.jaw) * (1 - Math.exp(-dt / (jawTarget > state.jaw ? .035 : .065))) : jawTarget;
  if (state.jaw < .001) state.jaw = 0;
  const mic = input.phase === "listening" ? unit(input.microphoneLevel) : 0;
  state.mic += (mic - state.mic) * (moving ? 1 - Math.exp(-dt / .09) : 1);
  const gx = Number.isFinite(input.gazeX) ? Math.max(-1, Math.min(1, input.gazeX)) : 0;
  const gy = Number.isFinite(input.gazeY) ? Math.max(-1, Math.min(1, input.gazeY)) : 0;
  state.gazeX += ((moving ? gx : 0) - state.gazeX) * blend;
  state.gazeY += ((moving ? gy : 0) - state.gazeY) * blend;
  const cycle = state.time % 8.7;
  const blinkAt = cycle >= 7.8 ? cycle - 7.8 : cycle - 3.55;
  const blink = moving && blinkAt >= 0 && blinkAt < .19 ? Math.sin(blinkAt / .19 * Math.PI) ** 2 : 0;
  return { pose: state.pose, time: moving ? state.time : 0,
    bob: moving ? Math.sin(state.time * 1.6) * 3 : 0,
    breathe: moving ? Math.sin(state.time * 2.1) * .008 : 0,
    blink, jaw: state.jaw, mic: state.mic, pet: state.pet,
    gazeX: state.gazeX, gazeY: state.gazeY, action: state.action };
}
const f = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(3);
export function eyePath(x: number, y: number, width: number, height: number, curve: number): string {
  const h = Math.max(.2, height);
  return `M${f(x - width)} ${f(y)} C${f(x - width)} ${f(y - h * 1.34 + curve)} ${f(x + width)} ${f(y - h * 1.34 + curve)} ${f(x + width)} ${f(y)} C${f(x + width)} ${f(y + h * 1.34 + curve)} ${f(x - width)} ${f(y + h * 1.34 + curve)} ${f(x - width)} ${f(y)}Z`;
}
export function mouthPath(width: number, smile: number, opening: number, skew: number): string {
  const x = 160, y = 192, top = smile - opening * .65, bottom = smile + opening * 1.6;
  return `M${f(x - width)} ${y} C${f(x - width * .5 + skew)} ${f(y + top)} ${f(x + width * .5 + skew)} ${f(y + top)} ${f(x + width)} ${y} C${f(x + width * .5 + skew)} ${f(y + bottom)} ${f(x - width * .5 + skew)} ${f(y + bottom)} ${f(x - width)} ${y}Z`;
}
