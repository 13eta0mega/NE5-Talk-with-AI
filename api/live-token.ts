import {
  buildSystemInstruction, createClient, expressionTool, isCharacterId, isModelId, isTrustedBrowserRequest, isVoiceName,
  noStore, normalizeClientApiKey, parseBody, type ApiRequest, type ApiResponse,
} from "./_shared.js";
import {
  GEMINI_31_TTS_MODEL, isConversationalLiveModel, isGemini25LiveModel, isGemini31ExpressiveTtsMode,
  isGemini31NativeYouthfulMode, normalizeLiveModelId, resolveLiveModelId,
} from "../src/core/gemini/catalog.js";

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

async function modelAvailable(client: Awaited<ReturnType<typeof createClient>>, modelId: string): Promise<boolean> {
  const pager = await client.models.list({ config: { pageSize: 100 } });
  for await (const model of pager) {
    if (normalizeLiveModelId(model.name) === modelId) return true;
  }
  return false;
}

function expressiveTtsSystemInstruction(base: string): string {
  return `${base}\n\n[외부 표현형 TTS 모드]\n응답은 실제로 소리 내어 말할 자연스러운 한국어 대사만 작성한다. 마크다운, 화자 라벨, 괄호형 무대 지시, TTS 지시문을 출력하지 않는다. 한 번의 응답은 가능하면 1~3개의 짧고 완결된 문장으로 만든다. 감정과 표정은 set_pet_expression 도구로 먼저 표현하고, 대사 자체는 캐릭터가 실제로 말할 문장만 반환한다.`;
}

function youthfulNativeSystemInstruction(base: string): string {
  return `${base}\n\n# Native Animation Performance Guard\n이 모드는 별도 TTS 없이 Gemini 3.1 Live Native Audio 자체가 최종 캐릭터 목소리다. 이미 제공된 Animated Mascot 음성 프로필을 실제 발성에 우선 적용한다.\n- 대사 내용만 캐릭터처럼 쓰고 목소리는 평범한 성인 톤으로 읽는 행동을 피한다.\n- 매 턴 첫 구절부터 밝은 공명, 가벼운 질감, 살아 있는 pitch contour가 들려야 한다.\n- 무표정한 낭독, 낮고 안정적인 설명체, 성숙한 여성 내레이션으로 회귀하지 않는다.\n- 감정이 바뀌면 같은 음색 안에서 속도, pitch movement, 강세, 미소의 정도를 즉시 바꾼다.\n- 선택된 preset voice를 기반으로 하되 캐릭터 연기 지시를 최대한 살린다.`;
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
    const requestedModelId = normalizeLiveModelId(body.modelId);
    const externalTts = isGemini31ExpressiveTtsMode(requestedModelId);
    const youthfulNative = isGemini31NativeYouthfulMode(requestedModelId);
    const modelId = resolveLiveModelId(requestedModelId);
    const clientApiKey = normalizeClientApiKey(body.apiKey);
    const client = await createClient(clientApiKey);
    if (!await modelAvailableForConversation(client, modelId)) {
      response.status(400).json({
        error: "선택한 모델이 현재 API 키에서 양방향 Live 모델로 조회되지 않습니다. 모델 목록을 새로고침해 주세요.",
      });
      return;
    }
    if (externalTts && !await modelAvailable(client, GEMINI_31_TTS_MODEL)) {
      response.status(400).json({ error: "현재 API 키에서 Gemini 3.1 Flash TTS 모델을 사용할 수 없습니다." });
      return;
    }
    const resumeHandle = typeof body.resumeHandle === "string"
      && body.resumeHandle.length <= 8192
      && body.resumeVoiceName === body.voiceName
      && typeof body.resumeModelId === "string"
      && normalizeLiveModelId(body.resumeModelId) === requestedModelId
      ? body.resumeHandle
      : undefined;
    const memorySummary = typeof body.memorySummary === "string" ? body.memorySummary.slice(0, 1600) : undefined;
    const now = Date.now();
    const transcription = transcriptionConfig(modelId);
    const is25 = isGemini25LiveModel(modelId);
    const expressionToolAvailable = !is25;
    const baseInstruction = buildSystemInstruction(
      body.characterId,
      memorySummary,
      expressionToolAvailable,
      youthfulNative ? "animated-mascot" : "default",
    );
    const systemInstruction = externalTts
      ? expressiveTtsSystemInstruction(baseInstruction)
      : youthfulNative
        ? youthfulNativeSystemInstruction(baseInstruction)
        : baseInstruction;
    const constrainedConfig: Record<string, unknown> = {
      responseModalities: ["AUDIO"],
      speechConfig: speechConfig(modelId, body.voiceName),
      inputAudioTranscription: transcription,
      outputAudioTranscription: transcription,
      realtimeInputConfig: REALTIME_INPUT_CONFIG,
      sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
      systemInstruction: { parts: [{ text: systemInstruction }] },
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
