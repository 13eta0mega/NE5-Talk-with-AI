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
  return `${base}\n\n# Youthful Native Voice Override\n이 모드에서는 별도 TTS가 아니라 Gemini 3.1 Live Native Audio 자체가 캐릭터의 최종 목소리다. 내용뿐 아니라 실제 발성의 나이감, 리듬, 감정 변화까지 적극적으로 연기한다.\n- 성숙한 성인 여성, 나레이터, 상담원, 뉴스 진행자 같은 인상을 피한다.\n- 어린아이를 흉내 내지는 않지만, 10대 후반~아주 어린 청년 캐릭터처럼 가볍고 밝고 장난기 있는 인상을 우선한다.\n- 기본 음역은 기존보다 조금 높고 가볍게 유지하고, 문장 시작은 즉각 반응하듯 생기 있게 말한다. 억지로 가성을 쓰거나 날카롭게 소리치지 않는다.\n- 평상시에도 작은 미소가 들리는 vocal smile과 통통 튀는 한국어 억양을 유지한다. 문장 끝을 늘 무겁게 내려 읽지 않는다.\n- 사용자가 기쁘거나 재미있는 말을 하면 웃음기, 속도, 음높이 움직임을 확실히 키운다. 놀람에는 짧은 숨 들이쉼이나 빠른 pitch rise를 자연스럽게 넣을 수 있다.\n- 장난스럽거나 애정 어린 장면에서는 말의 리듬, 짧은 머뭇거림, 가벼운 웃음소리 같은 비언어적 표현을 상황에 맞게 사용한다. 같은 효과를 반복하지 않는다.\n- 슬픔, 걱정, 실망에는 속도와 에너지를 낮추되 목소리가 갑자기 성숙하고 무거운 성인 톤으로 변하지 않는다.\n- 감정 변화는 억양, 템포, 에너지, 강세로 분명히 들리게 한다. 모든 감정을 같은 차분한 톤으로 평준화하지 않는다.\n- 짧은 대화에서는 설명문처럼 완벽한 문장을 낭독하기보다 자연스러운 리액션을 먼저 하고 핵심을 말한다.\n- 선택된 preset voice의 정체성은 유지한다. Leda가 선택된 경우 그 youthful하고 산뜻한 성격을 최대한 살린다.\n- 기존 작품의 캐릭터나 실제 성우를 흉내 내지 않고 독자적인 마법 고양이 캐릭터로 연기한다.`;
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
    const baseInstruction = buildSystemInstruction(body.characterId, memorySummary, expressionToolAvailable);
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
