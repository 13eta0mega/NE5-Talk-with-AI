import type { CharacterRigState, EmotionId, PetExpressionState } from "./types";

export const BASE_RIG: CharacterRigState = {
  headX: 0, headY: 0, headRotate: 0, headScaleX: 1, headScaleY: 1,
  bodyY: 0, bodyRotate: 0, bodyScaleY: 1,
  eyeOpenL: 1, eyeOpenR: 1, eyeScaleX: 1, eyeY: 0,
  browTiltL: 0, browTiltR: 0, browY: 0,
  mouthOpen: 0.02, mouthSmile: 0.42, mouthWidth: 1, mouthRound: 0,
  cheekOpacity: 0, armLiftL: 0, armLiftR: 0, armRotateL: 0, armRotateR: 0,
  bounce: 0.08, sway: 0.05, squash: 0,
};

const rig = (patch: Partial<CharacterRigState>): CharacterRigState => ({ ...BASE_RIG, ...patch });

export const EMOTION_RIGS: Record<EmotionId, CharacterRigState> = {
  neutral: rig({}),
  happy: rig({ eyeOpenL: 0.72, eyeOpenR: 0.72, mouthSmile: 0.72, cheekOpacity: 0.24, bounce: 0.2 }),
  joyful: rig({ eyeOpenL: 0.2, eyeOpenR: 0.2, mouthSmile: 1, mouthOpen: 0.32, mouthWidth: 1.14, cheekOpacity: 0.5, bounce: 0.7, armLiftL: 0.45, armLiftR: 0.45 }),
  excited: rig({ eyeOpenL: 1.24, eyeOpenR: 1.24, mouthSmile: 0.68, mouthOpen: 0.68, mouthRound: 0.2, bodyY: -8, bounce: 0.9, sway: 0.5, armLiftL: 0.75, armLiftR: 0.75 }),
  affectionate: rig({ headRotate: -5, eyeOpenL: 0.58, eyeOpenR: 0.58, mouthSmile: 0.68, cheekOpacity: 0.68, sway: 0.14 }),
  proud: rig({ headY: -8, headRotate: 2, eyeOpenL: 0.78, eyeOpenR: 0.78, mouthSmile: 0.48, bodyY: -5, bodyScaleY: 1.04, armRotateL: -10, armRotateR: 10 }),
  curious: rig({ headX: 5, headRotate: 8, eyeOpenL: 1.1, eyeOpenR: 0.8, browTiltL: -10, browTiltR: 12, browY: -5, mouthSmile: 0.2, mouthWidth: 0.82, sway: 0.12 }),
  surprised: rig({ headY: -4, eyeOpenL: 1.42, eyeOpenR: 1.42, browY: -12, mouthSmile: 0, mouthOpen: 0.82, mouthRound: 1, mouthWidth: 0.64, squash: -0.08 }),
  shy: rig({ headY: 8, headRotate: -4, eyeOpenL: 0.55, eyeOpenR: 0.55, eyeY: 6, mouthSmile: 0.38, mouthWidth: 0.72, cheekOpacity: 0.8, sway: 0.32, armLiftL: 0.28, armLiftR: 0.28 }),
  sleepy: rig({ headY: 9, headRotate: 4, eyeOpenL: 0.12, eyeOpenR: 0.12, mouthSmile: 0.05, mouthOpen: 0.08, mouthWidth: 0.7, sway: 0.36, bounce: 0.02 }),
  sad: rig({ headY: 11, headRotate: -2, eyeOpenL: 0.68, eyeOpenR: 0.68, eyeY: 5, browTiltL: -12, browTiltR: 12, browY: -2, mouthSmile: -0.72, mouthWidth: 0.88, bodyY: 5, bounce: 0.02, armRotateL: 8, armRotateR: -8 }),
  lonely: rig({ headX: -3, headY: 14, headRotate: -6, eyeOpenL: 0.48, eyeOpenR: 0.48, eyeY: 8, mouthSmile: -0.5, mouthWidth: 0.72, bodyY: 8, sway: 0.18, bounce: 0 }),
  worried: rig({ headRotate: 3, eyeOpenL: 0.92, eyeOpenR: 0.92, browTiltL: -16, browTiltR: 16, browY: -7, mouthSmile: -0.42, mouthWidth: 0.82, sway: 0.26, armLiftL: 0.18, armLiftR: 0.18 }),
  afraid: rig({ headY: -3, eyeOpenL: 1.32, eyeOpenR: 1.32, browTiltL: -14, browTiltR: 14, browY: -10, mouthSmile: -0.44, mouthOpen: 0.52, mouthRound: 0.55, bodyY: 5, squash: 0.08, sway: 0.8, armLiftL: 0.62, armLiftR: 0.62 }),
  angry: rig({ headY: 3, eyeOpenL: 0.56, eyeOpenR: 0.56, browTiltL: 24, browTiltR: -24, browY: -1, mouthSmile: -0.52, mouthOpen: 0.1, mouthWidth: 0.9, bodyY: -3, bodyRotate: -1, bounce: 0.32, armRotateL: -18, armRotateR: 18 }),
  confused: rig({ headRotate: -9, eyeOpenL: 0.72, eyeOpenR: 1.12, browTiltL: 18, browTiltR: -6, browY: -4, mouthSmile: -0.12, mouthWidth: 0.76, sway: 0.24 }),
};

export const EMOTION_META: Record<EmotionId, { label: string; valence: number; arousal: number }> = {
  neutral: { label: "평온", valence: 0, arousal: 0.25 }, happy: { label: "행복", valence: 0.7, arousal: 0.45 },
  joyful: { label: "기쁨", valence: 0.9, arousal: 0.75 }, excited: { label: "신남", valence: 0.82, arousal: 0.92 },
  affectionate: { label: "애정", valence: 0.75, arousal: 0.3 }, proud: { label: "뿌듯", valence: 0.62, arousal: 0.42 },
  curious: { label: "호기심", valence: 0.25, arousal: 0.58 }, surprised: { label: "놀람", valence: 0.1, arousal: 0.92 },
  shy: { label: "수줍음", valence: 0.32, arousal: 0.42 }, sleepy: { label: "졸림", valence: 0, arousal: 0.1 },
  sad: { label: "슬픔", valence: -0.7, arousal: 0.25 }, lonely: { label: "외로움", valence: -0.78, arousal: 0.18 },
  worried: { label: "걱정", valence: -0.5, arousal: 0.65 }, afraid: { label: "두려움", valence: -0.72, arousal: 0.9 },
  angry: { label: "화남", valence: -0.8, arousal: 0.8 }, confused: { label: "혼란", valence: -0.15, arousal: 0.56 },
};

export function expressionFor(emotion: EmotionId, intensity = 1): PetExpressionState {
  const meta = EMOTION_META[emotion];
  return { emotion, intensity: Math.min(1, Math.max(0, intensity)), valence: meta.valence, arousal: meta.arousal };
}

export function interpolateRig(
  current: CharacterRigState,
  target: CharacterRigState,
  alpha: number,
): CharacterRigState {
  const next = {} as CharacterRigState;
  for (const key of Object.keys(current) as (keyof CharacterRigState)[]) {
    next[key] = current[key] + (target[key] - current[key]) * alpha;
  }
  return next;
}

export function emotionTransitionRate(emotion: EmotionId): number {
  const arousal = EMOTION_META[emotion].arousal;
  return 5.2 + arousal * 5.4;
}
