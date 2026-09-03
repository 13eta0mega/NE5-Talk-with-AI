export const VOICE_PITCH_LEVELS = [-2, -1, 0, 1, 2] as const;
export type VoicePitchLevel = (typeof VOICE_PITCH_LEVELS)[number];

export const DEFAULT_VOICE_PITCH: VoicePitchLevel = 0;

const LABELS: Record<VoicePitchLevel, string> = {
  [-2]: "많이 낮게",
  [-1]: "조금 낮게",
  0: "기본",
  1: "조금 높게",
  2: "많이 높게",
};

const DIRECTIONS: Record<Exclude<VoicePitchLevel, 0>, string> = {
  [-2]: "평균 발화 음높이를 기본 캐릭터 음성보다 분명히 낮춘다. 말속도는 그대로 유지하고, 갑자기 성숙하거나 무거운 다른 화자처럼 바꾸지 않는다.",
  [-1]: "평균 발화 음높이를 기본 캐릭터 음성보다 살짝 낮춘다. 말속도와 캐릭터의 밝은 음색 정체성은 유지한다.",
  1: "평균 발화 음높이를 기본 캐릭터 음성보다 살짝 높이고 밝은 head resonance와 forward placement를 조금 더 강조한다. 말속도는 그대로 유지한다.",
  2: "평균 발화 음높이를 기본 캐릭터 음성보다 분명히 높이고 가볍고 밝은 head resonance를 강조한다. 말속도는 그대로 유지하며 어린아이, 헬륨, 칩멍크처럼 과장하지 않는다.",
};

export function normalizeVoicePitch(value: unknown): VoicePitchLevel {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_VOICE_PITCH;
  const rounded = Math.round(numeric);
  if ((VOICE_PITCH_LEVELS as readonly number[]).includes(rounded)) return rounded as VoicePitchLevel;
  return rounded < -2 ? -2 : rounded > 2 ? 2 : DEFAULT_VOICE_PITCH;
}

export function voicePitchLabel(value: unknown): string {
  return LABELS[normalizeVoicePitch(value)];
}

/**
 * Gemini Live currently has no numeric pitch field in speechConfig. This is a
 * relative performance direction for native audio/TTS, not a semitone guarantee.
 */
export function voicePitchSystemInstruction(value: unknown): string {
  const pitch = normalizeVoicePitch(value);
  if (pitch === 0) return "";
  return `# Voice Pitch Bias\n- ${DIRECTIONS[pitch]}\n- 이 설정은 대사 내용이 아니라 발성 성향이다. 한국어 발음, 캐릭터 정체성, 감정 연기는 그대로 유지한다.`;
}

export function voicePitchDirectorNote(value: unknown): string {
  const pitch = normalizeVoicePitch(value);
  return pitch === 0 ? "기본 음역을 유지" : DIRECTIONS[pitch];
}
