import {
  createClient, isTrustedBrowserRequest, noStore, normalizeClientApiKey, parseBody,
  type ApiRequest, type ApiResponse,
} from "./_shared.js";

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
    for await (const model of pager) {
      const id = (model.name ?? "").replace(/^models\//, "");
      const actions = model.supportedActions ?? [];
      if ((id.toLowerCase().includes("live") || actions.some((action) => action.toLowerCase().includes("bidi")))
        && !id.toLowerCase().includes("embedding")) {
        models.push({ id, displayName: model.displayName || id, description: model.description, supportedActions: actions });
      }
    }
    response.status(200).json(models.sort((a, b) => a.displayName.localeCompare(b.displayName)));
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Live 모델 목록을 불러오지 못했습니다." });
  }
}
