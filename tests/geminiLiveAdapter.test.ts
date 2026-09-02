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
});
