/// <reference types="node" />

import { GoogleGenAI } from "@google/genai";
import { buildSystemInstruction, PERSONA_IDS, type CharacterId } from "../electron/personaVault.js";
import { VOICE_CATALOG } from "../src/core/gemini/catalog.js";
import { EMOTION_IDS } from "../src/core/types.js";

export type ApiRequest = {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
};

export type ApiResponse = {
  status(code: number): ApiResponse;
  json(value: unknown): void;
  setHeader(name: string, value: string): void;
};

const VOICES = new Set<string>(VOICE_CATALOG.map(([name]) => name));

export const isCharacterId = (value: unknown): value is CharacterId =>
  typeof value === "string" && (PERSONA_IDS as readonly string[]).includes(value);
export const isVoiceName = (value: unknown): value is string => typeof value === "string" && VOICES.has(value);
export const isModelId = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 160 && /^[a-zA-Z0-9._/-]+$/.test(value);

export function noStore(response: ApiResponse): void {
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

export function isTrustedBrowserRequest(request: ApiRequest): boolean {
  const fetchSite = request.headers["sec-fetch-site"];
  const fetchSiteValue = Array.isArray(fetchSite) ? fetchSite[0] : fetchSite;
  if (fetchSiteValue && !["same-origin", "none"].includes(fetchSiteValue)) return false;

  const origin = request.headers.origin;
  const originValue = Array.isArray(origin) ? origin[0] : origin;
  if (!originValue) return true;
  const forwardedHost = request.headers["x-forwarded-host"] ?? request.headers.host;
  const hostValue = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
  try { return Boolean(hostValue) && new URL(originValue).host === hostValue; }
  catch { return false; }
}

export function configuredApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || undefined;
}

export function hasConfiguredApiKey(): boolean {
  return Boolean(configuredApiKey());
}

export function requireApiKey(): string {
  const value = configuredApiKey();
  if (!value) throw new Error("호스팅 서버에 GEMINI_API_KEY 또는 GOOGLE_API_KEY가 설정되지 않았습니다.");
  return value;
}

export function parseBody(request: ApiRequest): Record<string, unknown> {
  if (typeof request.body === "string") {
    try { return JSON.parse(request.body) as Record<string, unknown>; }
    catch { throw new Error("요청 본문이 올바른 JSON이 아닙니다."); }
  }
  if (request.body && typeof request.body === "object") return request.body as Record<string, unknown>;
  return {};
}

export function expressionTool() {
  return { functionDeclarations: [{
    name: "set_pet_expression",
    description: "Set the pet's visible empathetic expression before or during a spoken response.",
    parameters: {
      type: "OBJECT",
      properties: {
        emotion: { type: "STRING", enum: [...EMOTION_IDS] },
        intensity: { type: "NUMBER", minimum: 0, maximum: 1 },
        gesture: { type: "STRING" },
        hold_ms: { type: "INTEGER", minimum: 0, maximum: 10000 },
      },
      required: ["emotion", "intensity"],
    },
  }] };
}

export async function createClient(): Promise<GoogleGenAI> {
  return new GoogleGenAI({ apiKey: requireApiKey() });
}

export { buildSystemInstruction };
