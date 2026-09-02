import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GeminiLiveAdapter } from "../src/core/gemini/GeminiLiveAdapter";
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

  it("uses the current SDK v1beta default for ephemeral Live tokens", async () => {
    const adapterSource = await readFile(path.resolve("src/core/gemini/GeminiLiveAdapter.ts"), "utf8");
    const serverSource = await readFile(path.resolve("api/_shared.ts"), "utf8");
    expect(adapterSource).toContain("new GoogleGenAI({ apiKey: credentials.token })");
    expect(serverSource).toContain("new GoogleGenAI({ apiKey: requireApiKey() })");
    expect(adapterSource).not.toContain('apiVersion: "v1alpha"');
    expect(serverSource).not.toContain('apiVersion: "v1alpha"');
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

  it("makes the coordinator recover a stale session before sending", async () => {
    const source = await readFile(path.resolve("src/core/conversation/ConversationCoordinator.ts"), "utf8");
    expect(source).toContain("if (!this.provider.isReady)");
    expect(source).toContain('await this.reconnect("network")');
    expect(source).toContain("providerReady: this.provider.isReady");
  });
});
