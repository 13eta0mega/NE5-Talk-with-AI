export const EMOTION_IDS = [
  "neutral", "happy", "joyful", "excited", "affectionate", "proud", "curious", "surprised",
  "shy", "sleepy", "sad", "lonely", "worried", "afraid", "angry", "confused",
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

export interface CharacterRigState {
  headX: number;
  headY: number;
  headRotate: number;
  headScaleX: number;
  headScaleY: number;
  bodyY: number;
  bodyRotate: number;
  bodyScaleY: number;
  eyeOpenL: number;
  eyeOpenR: number;
  eyeScaleX: number;
  eyeY: number;
  browTiltL: number;
  browTiltR: number;
  browY: number;
  mouthOpen: number;
  mouthSmile: number;
  mouthWidth: number;
  mouthRound: number;
  cheekOpacity: number;
  armLiftL: number;
  armLiftR: number;
  armRotateL: number;
  armRotateR: number;
  bounce: number;
  sway: number;
  squash: number;
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
