import { isGemini25LiveModel } from "./catalog";

export const GEMINI25_SERVER_VAD = {
  disabled: false,
  startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
  endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
  prefixPaddingMs: 180,
  silenceDurationMs: 1100,
} as const;

export const DEFAULT_SERVER_VAD = {
  disabled: false,
  startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
  endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
  prefixPaddingMs: 120,
  silenceDurationMs: 900,
} as const;

/**
 * Gemini 2.5 Native Audio is intentionally conservative here. Its automatic
 * server VAD owns turn finalization; local RMS VAD is diagnostic only for 2.5.
 * Explicit activity-only coverage also prevents long idle microphone silence
 * from becoming part of a user turn.
 */
export function liveRealtimeInputConfig(modelId: string): Record<string, unknown> {
  if (isGemini25LiveModel(modelId)) {
    return {
      activityHandling: "NO_INTERRUPTION",
      turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY",
      automaticActivityDetection: { ...GEMINI25_SERVER_VAD },
    };
  }
  return {
    activityHandling: "NO_INTERRUPTION",
    automaticActivityDetection: { ...DEFAULT_SERVER_VAD },
  };
}
