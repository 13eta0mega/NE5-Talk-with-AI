import { afterEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { hasConfiguredApiKey, isTrustedBrowserRequest, normalizeClientApiKey, parseBody, type ApiRequest, type ApiResponse } from "../api/_shared";
import mobileStatus from "../api/mobile-status";

function request(headers: ApiRequest["headers"] = {}): ApiRequest {
  return { method: "GET", headers };
}

describe("mobile token broker boundary", () => {
  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
  });

  it("accepts same-origin browser requests and rejects cross-site requests", () => {
    expect(isTrustedBrowserRequest(request({ origin: "https://deskpet.example", host: "deskpet.example", "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isTrustedBrowserRequest(request({ origin: "https://attacker.example", host: "deskpet.example", "sec-fetch-site": "cross-site" }))).toBe(false);
  });

  it("parses JSON without allowing an invalid body", () => {
    expect(parseBody({ method: "POST", headers: {}, body: '{"voiceName":"Kore"}' })).toEqual({ voiceName: "Kore" });
    expect(() => parseBody({ method: "POST", headers: {}, body: "{" })).toThrow("올바른 JSON");
  });

  it("accepts both supported server-side Gemini API key names", () => {
    process.env.GOOGLE_API_KEY = "google-secret";
    expect(hasConfiguredApiKey()).toBe(true);
    delete process.env.GOOGLE_API_KEY;
    process.env.GEMINI_API_KEY = "gemini-secret";
    expect(hasConfiguredApiKey()).toBe(true);
  });

  it("validates a browser-provided Gemini API key without exposing it", () => {
    const key = "AQ.example-browser-api-key-123456789";
    expect(normalizeClientApiKey(`  ${key}  `)).toBe(key);
    expect(() => normalizeClientApiKey("short")).toThrow("형식");
  });

  it("reports only whether the server key is configured", () => {
    process.env.GOOGLE_API_KEY = "server-secret";
    let payload: unknown;
    let statusCode = 0;
    const response: ApiResponse = {
      status(code) { statusCode = code; return this; },
      json(value) { payload = value; },
      setHeader() {},
    };
    mobileStatus(request(), response);
    expect(statusCode).toBe(200);
    expect(payload).toEqual({ hasApiKey: true });
    expect(JSON.stringify(payload)).not.toContain("server-secret");
  });

  it("stores an editable mobile key locally and sends it only to same-origin broker endpoints", async () => {
    const source = await readFile(path.resolve("src/mobile/installMobileBridge.ts"), "utf8");
    expect(source).toContain('API_KEY_STORAGE_KEY = "deskpet:mobile-gemini-api-key:v1"');
    expect(source).toContain("localStorage.setItem(API_KEY_STORAGE_KEY, next)");
    expect(source).toContain("clearResumeState()");
    expect(source).toContain("apiKeyEditable: true");
    expect(source).toContain('keySource: localApiKey ? "browser-storage" : "none"');
    expect(source).toContain('apiRequest("/api/live-token"');
    expect(source).toContain("apiKey,");
    expect(source).toContain('apiRequest("/api/live-models", { method: "POST", body: JSON.stringify({ apiKey }) })');
    expect(source).toContain("API_TIMEOUT_MS = 12000");
    expect(source).toContain("controller.abort()");
  });
});
