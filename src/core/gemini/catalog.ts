export const VOICE_CATALOG = [
  ["Zephyr", "밝고 경쾌함"], ["Puck", "명랑하고 활기참"], ["Charon", "차분하고 설명적"],
  ["Kore", "단정하고 확고함"], ["Fenrir", "흥분감 있고 생동감"], ["Leda", "젊고 산뜻함"],
  ["Orus", "낮고 단호함"], ["Aoede", "가볍고 산들바람 같음"], ["Callirrhoe", "느긋하고 편안함"],
  ["Autonoe", "맑고 밝음"], ["Enceladus", "숨결이 섞인 부드러움"], ["Iapetus", "또렷하고 명확함"],
  ["Umbriel", "여유롭고 편안함"], ["Algieba", "매끄럽고 안정적"], ["Despina", "부드럽고 매끈함"],
  ["Erinome", "깨끗하고 선명함"], ["Algenib", "거칠고 개성 있음"], ["Rasalgethi", "정보 전달에 적합"],
  ["Laomedeia", "발랄하고 낙천적"], ["Achernar", "조용하고 부드러움"], ["Alnilam", "확신 있고 단단함"],
  ["Schedar", "균형 있고 고른 톤"], ["Gacrux", "성숙하고 깊이 있음"], ["Pulcherrima", "직진하고 적극적"],
  ["Achird", "친근하고 다정함"], ["Zubenelgenubi", "캐주얼하고 자연스러움"], ["Vindemiatrix", "온화하고 섬세함"],
  ["Sadachbia", "생기 있고 활발함"], ["Sadaltager", "지적이고 박식함"], ["Sulafat", "따뜻하고 포근함"],
] as const;

export const DEFAULT_VOICE_NAME = "Leda";
export const CHARACTER_VOICE_PROFILE_VERSION = 2;

// Keep this list intentionally narrow. models.list() also returns Live
// transcription/translation models and legacy IDs whose names contain "live",
// but DeskPet requires bidirectional conversational AUDIO output.
export const CONVERSATIONAL_LIVE_MODELS = [
  "gemini-3.1-flash-live-preview",
  "gemini-2.5-flash-native-audio-preview-12-2025",
] as const;

export type ConversationalLiveModelId = (typeof CONVERSATIONAL_LIVE_MODELS)[number];
export const DEFAULT_LIVE_MODEL: ConversationalLiveModelId = "gemini-3.1-flash-live-preview";

const CONVERSATIONAL_LIVE_MODEL_SET = new Set<string>(CONVERSATIONAL_LIVE_MODELS);

export function normalizeLiveModelId(value: unknown): string {
  return typeof value === "string" ? value.replace(/^models\//, "") : "";
}

export function isConversationalLiveModel(value: unknown): value is ConversationalLiveModelId {
  return CONVERSATIONAL_LIVE_MODEL_SET.has(normalizeLiveModelId(value));
}

export function coerceConversationalLiveModel(value: unknown): ConversationalLiveModelId {
  const normalized = normalizeLiveModelId(value);
  return isConversationalLiveModel(normalized) ? normalized : DEFAULT_LIVE_MODEL;
}
