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

export const GEMINI_31_LIVE_MODEL = "gemini-3.1-flash-live-preview";
export const GEMINI_31_TTS_MODEL = "gemini-3.1-flash-tts-preview";

// Virtual selectable mode. It still uses the exact same Gemini 3.1 Flash Live
// native AUDIO socket, but applies a stronger youthful/emotional voice-performance
// instruction. No separate TTS request is used, so latency and turn reliability stay
// on the normal Live path. Leda is the recommended preset because Google describes
// that voice as "Youthful".
export const GEMINI_31_NATIVE_YOUTHFUL_MODE = "gemini-3.1-flash-live-preview-youthful-expressive";

// Virtual selectable mode. The Live socket itself still produces native AUDIO so
// outputAudioTranscription can be used as the script for the separate 3.1 Flash TTS.
export const GEMINI_31_EXPRESSIVE_TTS_MODE = "gemini-3.1-flash-live-preview-with-expressive-tts";

// Preferred ordering only. This is deliberately NOT an allowlist anymore.
// Google can publish newer Native Audio / conversational Live model IDs or
// aliases without requiring an app update. The server verifies actual model
// availability through models.list() before minting a Live token.
export const CONVERSATIONAL_LIVE_MODELS = [
  GEMINI_31_LIVE_MODEL,
  "gemini-2.5-flash-native-audio-preview-12-2025",
] as const;

export type ConversationalLiveModelId = string;
export const DEFAULT_LIVE_MODEL = GEMINI_31_LIVE_MODEL;
export const GEMINI_25_LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

export function normalizeLiveModelId(value: unknown): string {
  return typeof value === "string" ? value.replace(/^models\//, "").trim() : "";
}

export function isGemini31ExpressiveTtsMode(value: unknown): boolean {
  return normalizeLiveModelId(value).toLowerCase() === GEMINI_31_EXPRESSIVE_TTS_MODE;
}

export function isGemini31NativeYouthfulMode(value: unknown): boolean {
  return normalizeLiveModelId(value).toLowerCase() === GEMINI_31_NATIVE_YOUTHFUL_MODE;
}

export function resolveLiveModelId(value: unknown): string {
  return isGemini31ExpressiveTtsMode(value) || isGemini31NativeYouthfulMode(value)
    ? GEMINI_31_LIVE_MODEL
    : normalizeLiveModelId(value);
}

export function isConversationalLiveModel(value: unknown): boolean {
  const id = normalizeLiveModelId(value).toLowerCase();
  if (id === GEMINI_31_EXPRESSIVE_TTS_MODE || id === GEMINI_31_NATIVE_YOUTHFUL_MODE) return true;
  if (!id || !id.startsWith("gemini-")) return false;
  if (id.includes("embedding") || id.includes("transcribe") || id.includes("translate") || id.includes("tts")) return false;
  if (id.startsWith("gemini-2.0-") || id === "gemini-live-2.5-flash-preview") return false;
  return id.includes("live") || id.includes("native-audio");
}

export function coerceConversationalLiveModel(value: unknown): ConversationalLiveModelId {
  const normalized = normalizeLiveModelId(value);
  return isConversationalLiveModel(normalized) ? normalized : DEFAULT_LIVE_MODEL;
}

export function isGemini25LiveModel(value: unknown): boolean {
  const id = normalizeLiveModelId(value).toLowerCase();
  return id.startsWith("gemini-2.5-") && (id.includes("live") || id.includes("native-audio"));
}

export function liveModelPreferenceRank(value: unknown): number {
  const id = normalizeLiveModelId(value);
  if (id === GEMINI_31_NATIVE_YOUTHFUL_MODE) return -30;
  if (id === GEMINI_31_EXPRESSIVE_TTS_MODE) return -20;
  const preferredIndex = CONVERSATIONAL_LIVE_MODELS.indexOf(id as (typeof CONVERSATIONAL_LIVE_MODELS)[number]);
  if (preferredIndex >= 0) return preferredIndex;
  if (/^gemini-3\.[2-9]/.test(id) || /^gemini-[4-9]/.test(id)) return -10;
  if (id.includes("latest")) return -5;
  if (id.startsWith("gemini-3.")) return 5;
  if (id.startsWith("gemini-2.5-")) return 20;
  return 50;
}
