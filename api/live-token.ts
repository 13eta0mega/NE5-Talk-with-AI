import {
  buildSystemInstruction, createClient, expressionTool, isCharacterId, isModelId, isTrustedBrowserRequest, isVoiceName,
  noStore, normalizeClientApiKey, parseBody, type ApiRequest, type ApiResponse,
} from "./_shared.js";
import { isConversationalLiveModel, isGemini25LiveModel, normalizeLiveModelId } from "../src/core/gemini/catalog.js";

const KOREAN_LANGUAGE_CODE = "ko-KR";
const REALTIME_INPUT_CONFIG = {
  automaticActivityDetection: {
    disabled: false,
    startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
    endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
    prefixPaddingMs: 250,
    silenceDurationMs: 650,
  },
};

function transcriptionConfig(modelId: string): Record<string, unknown> {
  return isGemini25LiveModel(modelId) ? {} : { languageCodes: [KOREAN_LANGUAGE_CODE] };
}

function speechConfig(modelId: string, voiceName: string): Record<string, unknown> {
  const config: Record<string, unknown> = {
    voiceConfig: { prebuiltVoiceConfig: { voiceName } },
  };
  // 2.5 Native Audio chooses language from the conversation. Supplying a
  // languageCode is unnecessary and has caused compatibility issues on preview
  // revisions, so only 3.1 receives the explicit Korean output hint.
  if (!isGemini25LiveModel(modelId)) config.languageCode = KOREAN_LANGUAGE_CODE;
  return config;
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  noStore(response);
  if (request.method !== "POST") {
    response.status(405).json({ error: "POST 요청만 허용됩니다." });
    return;
  }
  if (!isTrustedBrowserRequest(request)) {
    response.status(403).json({ error: "허용되지 않은 출처입니다." });
    return;
  }
  try {
    const body = parseBody(request);
    if (!isCharacterId(body.characterId) || !isVoiceName(body.voiceName) || !isModelId(body.modelId)) {
      response.status(400).json({ error: "올바르지 않은 Live 연결 요청입니다." });
      return;
    }
    const modelId = normalizeLiveModelId(body.modelId);
    if (!isConversationalLiveModel(modelId)) {
      response.status(400).json({ error: "이 모델은 DeskPet 양방향 음성 대화를 지원하지 않습니다. 모델 목록을 새로고침해 주세요." });
      return;
    }
    const clientApiKey = normalizeClientApiKey(body.apiKey);
    const resumeHandle = typeof body.resumeHandle === "string"
      && body.resumeHandle.length <= 8192
      && body.resumeVoiceName === body.voiceName
      && typeof body.resumeModelId === "string"
      && normalizeLiveModelId(body.resumeModelId) === modelId
      ? body.resumeHandle
      : undefined;
    const memorySummary = typeof body.memorySummary === "string" ? body.memorySummary.slice(0, 1600) : undefined;
    const now = Date.now();
    const client = await createClient(clientApiKey);
    const transcription = transcriptionConfig(modelId);
    const constrainedConfig: Record<string, unknown> = {
      responseModalities: ["AUDIO"],
      speechConfig: speechConfig(modelId, body.voiceName),
      inputAudioTranscription: transcription,
      outputAudioTranscription: transcription,
      realtimeInputConfig: REALTIME_INPUT_CONFIG,
      contextWindowCompression: { slidingWindow: {} },
      sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
      systemInstruction: { parts: [{ text: buildSystemInstruction(body.characterId, memorySummary) }] },
    };
    // The 2.5 Native Audio preview has had intermittent session-closing issues
    // around function calling. Keep conversation stability first and let the
    // renderer keep its existing expression until a later 2.5 revision fixes it.
    if (!isGemini25LiveModel(modelId)) constrainedConfig.tools = [expressionTool()];

    const token = await client.authTokens.create({ config: {
      uses: 1,
      expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
      liveConnectConstraints: { model: modelId, config: constrainedConfig },
    } } as never);
    response.status(200).json({
      token: token.name,
      model: modelId,
      expiresAt: now + 30 * 60 * 1000,
      hasResumeState: Boolean(resumeHandle),
    });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Live 토큰을 만들지 못했습니다." });
  }
}
