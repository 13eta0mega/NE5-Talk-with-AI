export const EMOTION_IDS = [
  "idle", "listening", "happy", "sleepy", "curious", "alert", "playful", "excited",
  "affectionate", "relaxed", "startled", "anxious", "annoyed", "angry", "sad", "scared",
  "laughing", "love", "wink", "proud", "smug", "thinking", "confused", "disappointed",
  "tired", "crying",
] as const;

export type EmotionId = (typeof EMOTION_IDS)[number];
export type ConversationPhase =
  | "disconnected" | "connecting" | "idle" | "listening" | "thinking"
  | "speaking" | "reconnecting" | "error";
export type VoiceName = string;
export type GestureId =
  | "none" | "nod" | "head_tilt_left" | "head_tilt_right" | "bounce"
  | "wave" | "shiver" | "sway" | "lean_forward" | "settle";

export interface PetExpressionState {
  emotion: EmotionId;
  intensity: number;
  valence: number;
  arousal: number;
  gesture?: GestureId;
}

const LEGACY_EMOTION_ALIASES: Record<string, EmotionId> = {
  neutral: "idle", joyful: "laughing", surprised: "startled", shy: "wink",
  lonely: "sad", worried: "anxious", afraid: "scared",
};

export function normalizeEmotionId(value: unknown): EmotionId {
  if (typeof value !== "string") return "idle";
  if ((EMOTION_IDS as readonly string[]).includes(value)) return value as EmotionId;
  return LEGACY_EMOTION_ALIASES[value] ?? "idle";
}

export interface LogicalSessionPublic {
  characterId: string;
  logicalSessionId: string;
  selectedVoiceName: VoiceName;
  selectedModelId: string;
  lastEmotion?: EmotionId;
  updatedAt: number;
}

export interface SecureSettingsPublic {
  hasApiKey: boolean;
  keySource: "environment" | "secure-storage" | "broker" | "none";
  apiKeyEditable?: boolean;
  encryptionAvailable: boolean;
  selectedVoiceName: VoiceName;
  selectedModelId: string;
  selectedCharacterId: string;
  microphoneId: string;
  speakerId: string;
  transcriptEnabled: boolean;
}

export interface LiveModelOption {
  id: string;
  displayName: string;
  description?: string;
  supportedActions: string[];
}

export type ProviderEvent =
  | { type: "connected"; resumed: boolean }
  | { type: "closed"; reason?: string }
  | { type: "error"; message: string }
  | { type: "audio"; pcm: Int16Array }
  | { type: "input-transcript"; text: string }
  | { type: "output-transcript"; text: string }
  | { type: "generation-complete" }
  | { type: "turn-complete" }
  | { type: "interrupted" }
  | { type: "resume-handle"; handle: string }
  | { type: "go-away"; timeLeftMs: number }
  | { type: "expression"; emotion: EmotionId; intensity: number; gesture?: GestureId };
