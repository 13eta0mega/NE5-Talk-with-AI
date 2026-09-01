import type { EmotionId, PetExpressionState } from "./types";

export const EMOTION_META: Record<EmotionId, { label: string; valence: number; arousal: number }> = {
  idle: { label: "평온", valence: 0, arousal: .22 }, listening: { label: "듣기", valence: .2, arousal: .48 },
  happy: { label: "기쁨", valence: .75, arousal: .5 }, sleepy: { label: "졸림", valence: .05, arousal: .08 },
  curious: { label: "호기심", valence: .3, arousal: .58 }, alert: { label: "경계", valence: -.05, arousal: .78 },
  playful: { label: "장난", valence: .72, arousal: .72 }, excited: { label: "신남", valence: .86, arousal: .94 },
  affectionate: { label: "애정", valence: .82, arousal: .34 }, relaxed: { label: "편안", valence: .48, arousal: .12 },
  startled: { label: "깜짝", valence: .02, arousal: .96 }, anxious: { label: "불안", valence: -.48, arousal: .68 },
  annoyed: { label: "정색", valence: -.42, arousal: .35 }, angry: { label: "분노", valence: -.82, arousal: .88 },
  sad: { label: "슬픔", valence: -.72, arousal: .22 }, scared: { label: "공포", valence: -.78, arousal: .92 },
  laughing: { label: "폭소", valence: .95, arousal: .86 }, love: { label: "사랑", valence: .92, arousal: .52 },
  wink: { label: "윙크", valence: .7, arousal: .48 }, proud: { label: "뿌듯", valence: .68, arousal: .44 },
  smug: { label: "능글", valence: .38, arousal: .28 }, thinking: { label: "고민", valence: .02, arousal: .4 },
  confused: { label: "혼란", valence: -.18, arousal: .56 }, disappointed: { label: "실망", valence: -.58, arousal: .2 },
  tired: { label: "피곤", valence: -.18, arousal: .08 }, crying: { label: "울음", valence: -.88, arousal: .3 },
};

export function expressionFor(emotion: EmotionId, intensity = 1): PetExpressionState {
  const meta = EMOTION_META[emotion];
  return { emotion, intensity: Math.min(1, Math.max(0, intensity)), valence: meta.valence, arousal: meta.arousal };
}
