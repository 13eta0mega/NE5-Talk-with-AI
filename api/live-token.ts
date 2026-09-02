import {
  buildSystemInstruction, createClient, expressionTool, isCharacterId, isModelId, isTrustedBrowserRequest, isVoiceName,
  noStore, normalizeClientApiKey, parseBody, type ApiRequest, type ApiResponse,
} from "./_shared.js";
import { isConversationalLiveModel, isGemini25LiveModel, normalizeLiveModelId } from "../src/core/gemini/catalog.js";

const KOREAN_LANGUAGE_CODE = "ko-KR";
const REALTIME_INPUT_CONFIG = {
  activityHandling: "NO_INTERRUPTION",
  automaticActivityDetection: {
    disabled: false,
    startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
    endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
    prefixPaddingMs: 120,
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
  if (!isGemini25LiveModel(modelId)) config.languageCode = KOREAN_LANGUAGE_CODE;
  return config;
}

function supportsBidi(actions: string[]): boolean {
  return actions.some((action) => action.toLowerCase().includes("bidi"));
}

async function modelAvailableForConversation(client: Awaited<ReturnType<typeof createClient>>, modelId: string): Promise<boolean> {
  if (!isConversationalLiveModel(modelId)) return false;
  const pager = await client.models.list({ config: { pageSize: 100 } });
  for await (const model of pager) {
    if (normalizeLiveModelId(model.name) !== modelId) continue;
    return supportsBidi(model.supportedActions ?? []);
  }
  return false;
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
    const clientApiKey = normalizeClientApiKey(body.apiKey);
    const client = await createClient(clientApiKey);
    if (!await modelAvailableForConversation(client, modelId)) {
      response.status(400).json({
        error: "선택한 모델이 현재 API 키에서 양방향 Native Audio Live 모델로 조회되지 않습니다. 모델 목록을 새로고침해 주세요.",
      });
      return;
    }
    const resumeHandle = typeof body.resumeHandle === "string"
      && body.resumeHandle.length <= 8192
      && body.resumeVoiceName === body.voiceName
      && typeof body.resumeModelId === "string"
      && normalizeLiveModelId(body.resumeModelId) === modelId
      ? body.resumeHandle
      : undefined;
    const memorySummary = typeof body.memorySummary === "string" ? body.memorySummary.slice(0, 1600) : undefined;
    const now = Date.now();
    const transcription = transcriptionConfig(modelId);
    const is25 = isGemini25LiveModel(modelId);
    const expressionToolAvailable = !is25;
    const constrainedConfig: Record<string, unknown> = {
      responseModalities: ["AUDIO"],
      speechConfig: speechConfig(modelId, body.voiceName),
      inputAudioTranscription: transcription,
      outputAudioTranscription: transcription,
      realtimeInputConfig: REALTIME_INPUT_CONFIG,
      sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
      systemInstruction: {
        parts: [{ text: buildSystemInstruction(body.characterId, memorySummary, expressionToolAvailable) }],
      },
    };
    if (is25) {
      constrainedConfig.thinkingConfig = { thinkingBudget: 0 };
    } else {
      constrainedConfig.contextWindowCompression = { slidingWindow: {} };
      constrainedConfig.tools = [expressionTool()];
    }

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
