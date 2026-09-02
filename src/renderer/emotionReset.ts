import type { ConversationPhase, EmotionId } from "../core/types";

export const EMOTION_IDLE_RESET_MS = 5_000;
export const EMOTION_AUDIO_ACTIVITY_THRESHOLD = .075;

export function shouldResetEmotion({
  emotion,
  phase,
  inputLevel,
  mouthLevel,
  lastActivityAt,
  now,
}: {
  emotion: EmotionId;
  phase: ConversationPhase;
  inputLevel: number;
  mouthLevel: number;
  lastActivityAt: number;
  now: number;
}): boolean {
  if (emotion === "idle" || emotion === "listening") return false;
  if (["connecting", "reconnecting", "thinking", "speaking"].includes(phase)) return false;
  if (inputLevel >= EMOTION_AUDIO_ACTIVITY_THRESHOLD || mouthLevel >= EMOTION_AUDIO_ACTIVITY_THRESHOLD) return false;
  return now - lastActivityAt >= EMOTION_IDLE_RESET_MS;
}
