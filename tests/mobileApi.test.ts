import { afterEach, describe, expect, it } from "vitest";
import { isTrustedBrowserRequest, parseBody, type ApiRequest, type ApiResponse } from "../api/_shared";
import mobileStatus from "../api/mobile-status";

function request(headers: ApiRequest["headers"] = {}): ApiRequest {
  return { method: "GET", headers };
}

describe("mobile token broker boundary", () => {
  afterEach(() => { delete process.env.GEMINI_API_KEY; });

  it("accepts same-origin browser requests and rejects cross-site requests", () => {
    expect(isTrustedBrowserRequest(request({
      origin: "https://deskpet.example",
      host: "deskpet.example",
      "sec-fetch-site": "same-origin",
    }))).toBe(true);
    expect(isTrustedBrowserRequest(request({
      origin: "https://attacker.example",
      host: "deskpet.example",
      "sec-fetch-site": "cross-site",
    }))).toBe(false);
  });

  it("parses JSON without allowing an invalid body", () => {
    expect(parseBody({ method: "POST", headers: {}, body: '{"voiceName":"Kore"}' })).toEqual({ voiceName: "Kore" });
    expect(() => parseBody({ method: "POST", headers: {}, body: "{" })).toThrow("올바른 JSON");
  });

  it("reports only whether the server key is configured", () => {
    process.env.GEMINI_API_KEY = "server-secret";
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
});
