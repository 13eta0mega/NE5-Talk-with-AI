import { describe, expect, it, vi } from "vitest";
import { GeminiLiveAdapter } from "../src/core/gemini/GeminiLiveAdapter";
import type { ProviderEvent } from "../src/core/types";

const MODEL_25 = "gemini-2.5-flash-native-audio-preview-12-2025";
const MODEL_31 = "gemini-3.1-flash-live-preview";

type AdapterInternals = {
  ready: boolean;
  activeModelId: string;
  session: {
    sendRealtimeInput(params: unknown): void;
    sendClientContent(params: unknown): void;
    sendToolResponse(params: unknown): void;
    close(): void;
  };
  handleMessage(message: Record<string, unknown>, characterId: string, voiceName: string, modelId: string): void;
};

function createHarness(model = MODEL_25) {
  const adapter = new GeminiLiveAdapter();
  const internals = adapter as unknown as AdapterInternals;
  const sendClientContent = vi.fn();
  const sendRealtimeInput = vi.fn();
  internals.ready = true;
  internals.activeModelId = model;
  internals.session = {
    sendRealtimeInput,
    sendClientContent,
    sendToolResponse: vi.fn(),
    close: vi.fn(),
  };
  const events: ProviderEvent[] = [];
  adapter.onEvent((event) => events.push(event));
  return {
    adapter,
    events,
    handle: internals.handleMessage.bind(adapter),
    sendClientContent,
    sendRealtimeInput,
  };
}

function audioChunk(): { serverContent: { modelTurn: { parts: Array<{ inlineData: { data: string } }> } } } {
  return { serverContent: { modelTurn: { parts: [{ inlineData: { data: "AQACAA==" } }] } } };
}

function incompleteTurn(handle: (message: Record<string, unknown>, characterId: string, voiceName: string, modelId: string) => void, model: string) {
  handle(audioChunk(), "greus-greeny", "Leda", model);
  handle({ serverContent: { outputTranscription: { text: "그 이유는 여러 가지가 있는데" } } }, "greus-greeny", "Leda", model);
  handle({ serverContent: { generationComplete: true, turnComplete: true } }, "greus-greeny", "Leda", model);
}

describe("Gemini Live inline completion recovery", () => {
  it("suppresses a premature 2.5 turnComplete and continues through client content", () => {
    const { events, handle, sendClientContent, sendRealtimeInput } = createHarness(MODEL_25);
    incompleteTurn(handle, MODEL_25);

    expect(sendClientContent).toHaveBeenCalledTimes(1);
    expect(sendClientContent.mock.calls[0]?.[0]).toMatchObject({ turnComplete: true });
    expect(sendRealtimeInput).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === "generation-complete")).toBe(false);
    expect(events.some((event) => event.type === "turn-complete")).toBe(false);
  });

  it("suppresses a premature 3.1 turnComplete and continues through realtime text", () => {
    const { events, handle, sendClientContent, sendRealtimeInput } = createHarness(MODEL_31);
    incompleteTurn(handle, MODEL_31);

    expect(sendClientContent).not.toHaveBeenCalled();
    expect(sendRealtimeInput).toHaveBeenCalledTimes(1);
    expect(sendRealtimeInput.mock.calls[0]?.[0]).toMatchObject({ text: expect.any(String) });
    expect(events.some((event) => event.type === "generation-complete")).toBe(false);
    expect(events.some((event) => event.type === "turn-complete")).toBe(false);
  });

  it("routes normal typed chat to the model-supported transport", () => {
    const twoFive = createHarness(MODEL_25);
    twoFive.adapter.sendText("2.5 채팅");
    expect(twoFive.sendClientContent).toHaveBeenCalledWith({ turns: "2.5 채팅", turnComplete: true });
    expect(twoFive.sendRealtimeInput).not.toHaveBeenCalled();

    const threeOne = createHarness(MODEL_31);
    threeOne.adapter.sendText("3.1 채팅");
    expect(threeOne.sendClientContent).not.toHaveBeenCalled();
    expect(threeOne.sendRealtimeInput).toHaveBeenCalledWith({ text: "3.1 채팅" });
  });

  it("lets clearly complete answers finish normally on both models", () => {
    for (const model of [MODEL_25, MODEL_31]) {
      const { events, handle, sendClientContent, sendRealtimeInput } = createHarness(model);
      handle(audioChunk(), "greus-greeny", "Leda", model);
      handle({ serverContent: { outputTranscription: { text: "응, 그렇게 하면 돼요." } } }, "greus-greeny", "Leda", model);
      handle({ serverContent: { generationComplete: true, turnComplete: true } }, "greus-greeny", "Leda", model);

      expect(sendClientContent).not.toHaveBeenCalled();
      expect(sendRealtimeInput).not.toHaveBeenCalled();
      expect(events.some((event) => event.type === "generation-complete")).toBe(true);
      expect(events.some((event) => event.type === "turn-complete")).toBe(true);
    }
  });

  it("bounds repair loops for both 2.5 and 3.1", () => {
    for (const model of [MODEL_25, MODEL_31]) {
      const { events, handle, sendClientContent, sendRealtimeInput } = createHarness(model);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        handle(audioChunk(), "greus-greeny", "Leda", model);
        handle({ serverContent: { outputTranscription: { text: attempt === 0 ? "설명하자면 여러 가지가 있는데" : "그리고 다음으로는" } } }, "greus-greeny", "Leda", model);
        handle({ serverContent: { generationComplete: true, turnComplete: true } }, "greus-greeny", "Leda", model);
      }
      const repairCalls = model === MODEL_25 ? sendClientContent.mock.calls.length : sendRealtimeInput.mock.calls.length;
      expect(repairCalls).toBe(2);
      expect(events.filter((event) => event.type === "turn-complete")).toHaveLength(1);
    }
  });

  it("survives 100 deterministic incomplete-turn sequences per model without unbounded continuation", () => {
    for (const model of [MODEL_25, MODEL_31]) {
      for (let run = 0; run < 100; run += 1) {
        const { handle, sendClientContent, sendRealtimeInput } = createHarness(model);
        incompleteTurn(handle, model);
        const calls = model === MODEL_25 ? sendClientContent.mock.calls.length : sendRealtimeInput.mock.calls.length;
        expect(calls).toBe(1);
      }
    }
  });
});
