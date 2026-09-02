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

export type EmotionInference = {
  emotion: EmotionId;
  intensity: number;
};

type EmotionSignal = EmotionInference & { keywords: readonly string[] };

const EMOTION_SIGNALS: readonly EmotionSignal[] = [
  { emotion: "crying", intensity: .96, keywords: ["눈물이 나", "눈물이 났", "눈물 나", "울었어", "울었는데", "울고 있어", "울고있어", "흐느껴", "엉엉"] },
  { emotion: "sad", intensity: .84, keywords: ["슬퍼", "슬프", "속상", "우울", "외로", "서러", "마음이 아파", "마음 아파", "가슴이 아파", "상실", "이별", "헤어졌", "떠나갔", "돌아가셨", "죽었", "힘들었"] },
  { emotion: "angry", intensity: .9, keywords: ["화나", "화가 나", "열받", "빡치", "분노", "화났", "못 참겠"] },
  { emotion: "annoyed", intensity: .72, keywords: ["짜증", "귀찮", "거슬려", "정색", "불쾌"] },
  { emotion: "scared", intensity: .9, keywords: ["무서워", "무섭", "두려워", "두렵", "겁나", "공포"] },
  { emotion: "anxious", intensity: .76, keywords: ["불안", "걱정", "긴장", "초조", "조마조마"] },
  { emotion: "disappointed", intensity: .78, keywords: ["실망", "허탈", "기대했는데", "아쉬워", "아쉽"] },
  { emotion: "tired", intensity: .68, keywords: ["피곤", "지쳤", "지쳐", "기운 없어", "힘이 없어"] },
  { emotion: "sleepy", intensity: .66, keywords: ["졸려", "졸리", "잠 와", "잠온다"] },
  { emotion: "startled", intensity: .84, keywords: ["깜짝", "놀랐", "놀라서", "헉", "세상에"] },
  { emotion: "excited", intensity: .92, keywords: ["신나", "설레", "두근두근", "너무 기대", "최고야"] },
  { emotion: "laughing", intensity: .9, keywords: ["웃겨", "웃기다", "빵 터졌", "ㅋㅋㅋ", "ㅎㅎㅎ"] },
  { emotion: "love", intensity: .88, keywords: ["사랑해", "사랑한다", "너무 좋아해", "정말 좋아해"] },
  { emotion: "affectionate", intensity: .74, keywords: ["고마워", "고맙", "보고 싶", "보고싶", "소중해", "따뜻해"] },
  { emotion: "happy", intensity: .8, keywords: ["행복", "기뻐", "기쁘", "좋았어", "좋다", "좋아", "잘됐", "다행이야"] },
  { emotion: "proud", intensity: .76, keywords: ["뿌듯", "해냈", "성공했", "잘했지", "자랑스러"] },
  { emotion: "confused", intensity: .7, keywords: ["헷갈", "혼란", "모르겠", "이해가 안", "뭐지"] },
  { emotion: "curious", intensity: .64, keywords: ["궁금", "알고 싶", "왜 그런", "어떻게 된"] },
  { emotion: "relaxed", intensity: .62, keywords: ["편안", "마음이 놓", "안심", "느긋", "평온"] },
];

function isNegated(text: string, index: number, keywordLength: number): boolean {
  const before = text.slice(Math.max(0, index - 9), index);
  const after = text.slice(index + keywordLength, index + keywordLength + 9);
  return /(?:안|전혀|별로|하나도|그다지)\s*$/.test(before)
    || /^\s*(?:하지\s*않|지\s*않|않아|아니야|아니다)/.test(after);
}

function countUnnegatedMatches(text: string, keywords: readonly string[]): number {
  let count = 0;
  for (const keyword of keywords) {
    let cursor = 0;
    while (cursor < text.length) {
      const index = text.indexOf(keyword, cursor);
      if (index < 0) break;
      if (!isNegated(text, index, keyword.length)) count += 1;
      cursor = index + keyword.length;
    }
  }
  return count;
}

export function inferEmotionFromText(value: string): EmotionInference | undefined {
  const text = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return undefined;

  let best: { signal: EmotionSignal; hits: number; score: number } | undefined;
  for (const signal of EMOTION_SIGNALS) {
    const hits = countUnnegatedMatches(text, signal.keywords);
    if (!hits) continue;
    const score = signal.intensity + Math.min(.12, (hits - 1) * .04);
    if (!best || score > best.score) best = { signal, hits, score };
  }
  if (!best) return undefined;
  return {
    emotion: best.signal.emotion,
    intensity: Math.min(1, best.signal.intensity + Math.min(.12, (best.hits - 1) * .04)),
  };
}

export function expressionFor(emotion: EmotionId, intensity = 1): PetExpressionState {
  const meta = EMOTION_META[emotion];
  return { emotion, intensity: Math.min(1, Math.max(0, intensity)), valence: meta.valence, arousal: meta.arousal };
}
