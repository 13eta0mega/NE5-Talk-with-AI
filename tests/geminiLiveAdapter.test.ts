import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GeminiLiveAdapter } from "../src/core/gemini/GeminiLiveAdapter";
import { CONVERSATIONAL_LIVE_MODELS, VOICE_CATALOG, coerceConversationalLiveModel, isConversationalLiveModel, isGemini25LiveModel } from "../src/core/gemini/catalog";
import type { ProviderEvent } from "../src/core/types";

describe("Gemini Live audio messages", () => {
  it("plays every audio part included in one model turn", () => {
    const adapter = new GeminiLiveAdapter();
    const events: ProviderEvent[] = [];
    adapter.onEvent((event) => events.push(event));

    const handleMessage = (adapter as unknown as {
      handleMessage(message: Record<string, unknown>, characterId: string, voiceName: string, modelId: string): void;
    }).handleMessage.bind(adapter);
    handleMessage({
      serverContent: {
        modelTurn: {
          parts: [
            { inlineData: { data: "AQACAA==" } },
            { text: "중간 텍스트" },
            { inlineData: { data: "AwAEAA==" } },
          ],
        },
      },
    }, "greus-greeny", "Leda", "gemini-3.1-flash-live-preview");

    const audio = events.filter((event): event is Extract<ProviderEvent, { type: "audio" }> => event.type === "audio");
    expect(audio).toHaveLength(2);
    expect([...audio[0].pcm]).toEqual([1, 2]);
    expect([...audio[1].pcm]).toEqual([3, 4]);
  });

  it("emits waiting-for-input so the UI cannot stay stuck thinking", () => {
    const adapter = new GeminiLiveAdapter();
    const events: ProviderEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    const handleMessage = (adapter as unknown as {
      handleMessage(message: Record<string, unknown>, characterId: string, voiceName: string, modelId: string): void;
    }).handleMessage.bind(adapter);
    handleMessage({ serverContent: { waitingForInput: true } }, "greus-greeny", "Leda", "gemini-3.1-flash-live-preview");
    expect(events.some((event) => event.type === "waiting-for-input")).toBe(true);
  });

  it("uses the current SDK v1beta default for ephemeral Live tokens", async () => {
    const adapterSource = await readFile(path.resolve("src/core/gemini/GeminiLiveAdapter.ts"), "utf8");
    const serverSource = await readFile(path.resolve("api/_shared.ts"), "utf8");
    expect(adapterSource).toContain("new GoogleGenAI({ apiKey: credentials.token })");
    expect(serverSource).toContain("new GoogleGenAI({ apiKey: requireApiKey(apiKeyOverride) })");
    expect(adapterSource).not.toContain('apiVersion: "v1alpha"');
    expect(serverSource).not.toContain('apiVersion: "v1alpha"');
  });

  it("accepts future conversational Live IDs while rejecting non-conversation models", async () => {
    expect(CONVERSATIONAL_LIVE_MODELS).toContain("gemini-3.1-flash-live-preview");
    expect(isConversationalLiveModel("models/gemini-2.5-flash-native-audio-preview-12-2025")).toBe(true);
    expect(isGemini25LiveModel("models/gemini-2.5-flash-native-audio-preview-12-2025")).toBe(true);
    expect(isConversationalLiveModel("gemini-3.2-flash-live-preview")).toBe(true);
    expect(isConversationalLiveModel("gemini-3.2-flash-live-latest")).toBe(true);
    expect(coerceConversationalLiveModel("gemini-3.2-flash-live-latest")).toBe("gemini-3.2-flash-live-latest");
    expect(isConversationalLiveModel("gemini-3.5-transcribe-live")).toBe(false);
    expect(isConversationalLiveModel("gemini-3.5-live-translate-preview")).toBe(false);
    expect(isConversationalLiveModel("gemini-2.0-flash-live-001")).toBe(false);
    expect(coerceConversationalLiveModel("gemini-2.0-flash-live-001")).toBe("gemini-3.1-flash-live-preview");

    const listSource = await readFile(path.resolve("api/live-models.ts"), "utf8");
    const tokenSource = await readFile(path.resolve("api/live-token.ts"), "utf8");
    expect(listSource).not.toContain("const SUPPORTED = new Set");
    expect(listSource).toContain("isConversationalLiveModel(id)");
    expect(listSource).toContain("supportsBidi(actions)");
    expect(tokenSource).toContain("modelAvailableForConversation");
    expect(tokenSource).toContain("client.models.list");
  });

  it("uses a conservative 2.5 Native Audio config and keeps richer newer-model features", async () => {
    const adapterSource = await readFile(path.resolve("src/core/gemini/GeminiLiveAdapter.ts"), "utf8");
    const tokenSource = await readFile(path.resolve("api/live-token.ts"), "utf8");
    for (const source of [adapterSource, tokenSource]) {
      expect(source).toContain('KOREAN_LANGUAGE_CODE = "ko-KR"');
      expect(source).toContain("isGemini25LiveModel");
      expect(source).toContain("languageCodes: [KOREAN_LANGUAGE_CODE]");
      expect(source).toContain('startOfSpeechSensitivity: "START_SENSITIVITY_LOW"');
      expect(source).toContain('endOfSpeechSensitivity: "END_SENSITIVITY_HIGH"');
      expect(source).toContain("silenceDurationMs: 650");
    }
    expect(adapterSource).toContain("if (!isGemini25LiveModel(resolvedModel)) config.tools = [expressionTool()]");
    expect(tokenSource).toContain("if (!isGemini25LiveModel(modelId)) constrainedConfig.tools = [expressionTool()]");
  });

  it("shows perceived feminine/masculine presentation in every voice option", () => {
    expect(VOICE_CATALOG).toHaveLength(30);
    expect(VOICE_CATALOG.every(([, description]) => description.startsWith("여성형 ·") || description.startsWith("남성형 ·"))).toBe(true);
    expect(VOICE_CATALOG.find(([name]) => name === "Leda")?.[1]).toContain("여성형");
    expect(VOICE_CATALOG.find(([name]) => name === "Puck")?.[1]).toContain("남성형");
  });

  it("does not announce ready at raw websocket open time", async () => {
    const source = await readFile(path.resolve("src/core/gemini/GeminiLiveAdapter.ts"), "utf8");
    const onOpenStart = source.indexOf("onopen:");
    const onMessageStart = source.indexOf("onmessage:", onOpenStart);
    const onOpenBody = source.slice(onOpenStart, onMessageStart);
    expect(onOpenBody).not.toContain("this.ready = true");
    expect(onOpenBody).not.toContain('type: "connected"');
    expect(source).toContain("this.session = session");
    expect(source).toContain("this.ready = true");
    expect(source).toContain('this.emit({ type: "connected"');
  });

  it("sends chat text as ordered client content and guards readiness", async () => {
    const source = await readFile(path.resolve("src/core/gemini/GeminiLiveAdapter.ts"), "utf8");
    expect(source).toContain("get isReady(): boolean");
    expect(source).toContain('sendClientContent({ turns: text, turnComplete: true })');
    expect(source).toContain("if (!this.isReady)");
  });

  it("bounds automatic reconnect loops and stalled thinking turns", async () => {
    const source = await readFile(path.resolve("src/core/conversation/ConversationCoordinator.ts"), "utf8");
    expect(source).toContain("MAX_AUTO_RECONNECT_ATTEMPTS = 3");
    expect(source).toContain("THINKING_RESPONSE_TIMEOUT_MS = 10000");
    expect(source).toContain("armThinkingResponseTimer()");
    expect(source).toContain('case "waiting-for-input"');
    expect(source).toContain("settleWaitingForInput()");
    expect(source).toContain("autoReconnectAttempts: this.autoReconnectAttempts");
  });
});
