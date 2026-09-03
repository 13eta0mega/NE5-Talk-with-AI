import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSystemInstruction } from "../electron/personaVault";

describe("Gemini 2.5 Live stability profile", () => {
  it("never instructs 2.5 to call an expression tool that is not exposed", () => {
    const withoutTool = buildSystemInstruction("greus-greeny", undefined, false);
    const withTool = buildSystemInstruction("greus-greeny", undefined, true);
    expect(withoutTool).not.toContain("set_pet_expression");
    expect(withTool).toContain("set_pet_expression");
  });

  it("keeps ephemeral Live on the documented v1beta route", async () => {
    const adapter = await readFile(path.resolve("src/core/gemini/GeminiLiveAdapter.ts"), "utf8");
    expect(adapter).toContain("new GoogleGenAI({ apiKey: credentials.token })");
    expect(adapter).not.toContain('apiVersion: "v1alpha"');
  });

  it("fails fast when setup never completes or the websocket closes early", async () => {
    const adapter = await readFile(path.resolve("src/core/gemini/GeminiLiveAdapter.ts"), "utf8");
    expect(adapter).toContain("LIVE_CONNECT_TIMEOUT_MS = 12000");
    expect(adapter).toContain("RESUME_CONNECT_TIMEOUT_MS = 6000");
    expect(adapter).toContain("Promise.race([connectPromise, earlyFailure, timeout])");
    expect(adapter).toContain("rejectSetup?.(new Error(message))");
    expect(adapter).toContain("code?: number");
  });

  it("falls back to a fresh token when a stored resume handle stalls", async () => {
    const adapter = await readFile(path.resolve("src/core/gemini/GeminiLiveAdapter.ts"), "utf8");
    const bridge = await readFile(path.resolve("src/mobile/installMobileBridge.ts"), "utf8");
    expect(adapter).toContain("!credentials.hasResumeState");
    expect(adapter).toContain("resumeHandle: null");
    expect(adapter).toContain("freshSession: true");
    expect(bridge).toContain("if (request.freshSession)");
    expect(bridge).toContain("delete session.resumeHandle");
  });

  it("shows the actual terminal error instead of only the generic pause label", async () => {
    const app = await readFile(path.resolve("src/renderer/App.tsx"), "utf8");
    expect(app).toContain('["error", "reconnecting"].includes(phase) && snapshot.error');
    expect(app).toContain('!["error", "reconnecting"].includes(phase) && transcriptEnabled');
  });

  it("uses a lean 2.5 profile while keeping session resumption", async () => {
    const adapter = await readFile(path.resolve("src/core/gemini/GeminiLiveAdapter.ts"), "utf8");
    const token = await readFile(path.resolve("api/live-token.ts"), "utf8");
    for (const source of [adapter, token]) {
      expect(source).toContain("thinkingBudget: 0");
      expect(source).toContain("sessionResumption:");
      expect(source).toContain("contextWindowCompression");
    }
    expect(adapter).toContain("if (is25)");
    expect(adapter).toContain("else {");
    expect(token).toContain("if (is25)");
  });

  it("uses the same expression-tool availability for token constraints and persona", async () => {
    const token = await readFile(path.resolve("api/live-token.ts"), "utf8");
    expect(token).toContain("const expressionToolAvailable = !is25");
    expect(token).toContain("buildSystemInstruction(body.characterId, memorySummary, expressionToolAvailable)");
    expect(token).toContain("constrainedConfig.tools = [expressionTool()]");
  });
});
