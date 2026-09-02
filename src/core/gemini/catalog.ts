// Google documents the voice names and style descriptors, but does not publish
// speaker gender metadata. The 여성형/남성형 labels below are UX presentation
// labels for the perceived voice character, not claims about a speaker identity.
export const VOICE_CATALOG = [
  ["Zephyr", "여성형 · 밝고 경쾌함"], ["Puck", "남성형 · 명랑하고 활기참"], ["Charon", "남성형 · 차분하고 설명적"],
  ["Kore", "여성형 · 단정하고 확고함"], ["Fenrir", "남성형 · 흥분감 있고 생동감"], ["Leda", "여성형 · 젊고 산뜻함"],
  ["Orus", "남성형 · 낮고 단호함"], ["Aoede", "여성형 · 가볍고 산들바람 같음"], ["Callirrhoe", "여성형 · 느긋하고 편안함"],
  ["Autonoe", "여성형 · 맑고 밝음"], ["Enceladus", "남성형 · 숨결이 섞인 부드러움"], ["Iapetus", "남성형 · 또렷하고 명확함"],
  ["Umbriel", "남성형 · 여유롭고 편안함"], ["Algieba", "남성형 · 매끄럽고 안정적"], ["Despina", "여성형 · 부드럽고 매끈함"],
  ["Erinome", "여성형 · 깨끗하고 선명함"], ["Algenib", "남성형 · 거칠고 개성 있음"], ["Rasalgethi", "남성형 · 정보 전달에 적합"],
  ["Laomedeia", "여성형 · 발랄하고 낙천적"], ["Achernar", "여성형 · 조용하고 부드러움"], ["Alnilam", "남성형 · 확신 있고 단단함"],
  ["Schedar", "남성형 · 균형 있고 고른 톤"], ["Gacrux", "여성형 · 성숙하고 깊이 있음"], ["Pulcherrima", "여성형 · 직진하고 적극적"],
  ["Achird", "남성형 · 친근하고 다정함"], ["Zubenelgenubi", "남성형 · 캐주얼하고 자연스러움"], ["Vindemiatrix", "여성형 · 온화하고 섬세함"],
  ["Sadachbia", "남성형 · 생기 있고 활발함"], ["Sadaltager", "남성형 · 지적이고 박식함"], ["Sulafat", "여성형 · 따뜻하고 포근함"],
] as const;

export const DEFAULT_VOICE_NAME = "Leda";
export const CHARACTER_VOICE_PROFILE_VERSION = 2;

// Both currently supported Native Audio Live models expose the same 30
// prebuilt voices. Keep this list intentionally narrow: models.list() also
// returns transcription/translation Live models and retired IDs.
export const CONVERSATIONAL_LIVE_MODELS = [
  "gemini-3.1-flash-live-preview",
  "gemini-2.5-flash-native-audio-preview-12-2025",
] as const;

export type ConversationalLiveModelId = (typeof CONVERSATIONAL_LIVE_MODELS)[number];
export const DEFAULT_LIVE_MODEL: ConversationalLiveModelId = "gemini-3.1-flash-live-preview";
export const GEMINI_25_LIVE_MODEL: ConversationalLiveModelId = "gemini-2.5-flash-native-audio-preview-12-2025";

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

export function isGemini25LiveModel(value: unknown): boolean {
  return normalizeLiveModelId(value) === GEMINI_25_LIVE_MODEL;
}
