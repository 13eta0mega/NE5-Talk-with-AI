import { noStore, type ApiRequest, type ApiResponse } from "./_shared";

export default function handler(request: ApiRequest, response: ApiResponse): void {
  noStore(response);
  if (request.method !== "GET") {
    response.status(405).json({ error: "GET 요청만 허용됩니다." });
    return;
  }
  response.status(200).json({ hasApiKey: Boolean(process.env.GEMINI_API_KEY?.trim()) });
}
