import {
  createClient, isTrustedBrowserRequest, noStore, normalizeClientApiKey, parseBody,
  type ApiRequest, type ApiResponse,
} from "./_shared.js";
import {
  GEMINI_31_EXPRESSIVE_TTS_MODE, GEMINI_31_LIVE_MODEL, GEMINI_31_TTS_MODEL,
  isConversationalLiveModel, liveModelPreferenceRank, normalizeLiveModelId,
} from "../src/core/gemini/catalog.js";

function supportsBidi(actions: string[]): boolean {
  return actions.some((action) => action.toLowerCase().includes("bidi"));
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  noStore(response);
  if (!request.method || !["GET", "POST"].includes(request.method)) {
    response.status(405).json({ error: "GET 또는 POST 요청만 허용됩니다." });
    return;
  }
  if (!isTrustedBrowserRequest(request)) {
    response.status(403).json({ error: "허용되지 않은 출처입니다." });
    return;
  }
  try {
    const body = request.method === "POST" ? parseBody(request) : {};
    const clientApiKey = normalizeClientApiKey(body.apiKey);
    const client = await createClient(clientApiKey);
    const pager = await client.models.list({ config: { pageSize: 100 } });
    const models: Array<{ id: string; displayName: string; description?: string; supportedActions: string[] }> = [];
    const availableIds = new Set<string>();
    for await (const model of pager) {
      const id = normalizeLiveModelId(model.name);
      const actions = model.supportedActions ?? [];
      if (id) availableIds.add(id);
      if (!isConversationalLiveModel(id) || !supportsBidi(actions)) continue;
      models.push({
        id,
        displayName: model.displayName || id,
        description: model.description,
        supportedActions: actions,
      });
    }

    if (models.some((model) => model.id === GEMINI_31_LIVE_MODEL) && availableIds.has(GEMINI_31_TTS_MODEL)) {
      models.push({
        id: GEMINI_31_EXPRESSIVE_TTS_MODE,
        displayName: "Gemini 3.1 Live + 3.1 Flash TTS · 애니메이션 성우",
        description: "Gemini 3.1 Live의 저지연 대화와 별도 Gemini 3.1 Flash TTS 스트리밍을 결합한 표현형 음성 모드",
        supportedActions: ["bidi", "tts-stream"],
      });
    }

    response.status(200).json(models.sort((a, b) => {
      const rank = liveModelPreferenceRank(a.id) - liveModelPreferenceRank(b.id);
      return rank || b.id.localeCompare(a.id);
    }));
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Live 모델 목록을 불러오지 못했습니다." });
  }
}
