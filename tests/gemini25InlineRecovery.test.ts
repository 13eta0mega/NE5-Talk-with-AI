import { describe, expect, it, vi } from "vitest";
import { GeminiLiveAdapter } from "../src/core/gemini/GeminiLiveAdapter";
import type { ProviderEvent } from "../src/core/types";

const MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

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

function createHarness() {
  const adapter = new GeminiLiveAdapter();
  const internals = adapter as unknown as AdapterInternals;
  const sendClientContent = vi.fn();
  internals.ready = true;
  internals.activeModelId = MODEL;
  internals.session = {
    sendRealtimeInput: vi.fn(),
    sendClientContent,
    sendToolResponse: vi.fn(),
    close: vi.fn(),
  };
  const events: ProviderEvent[] = [];
  adapter.onEvent((event) => events.push(event));
  const handle = internals.handleMessage.bind(adapter);
  return { events, handle, sendClientContent };
}

function audioChunk(): { serverContent: { modelTurn: { parts: Array<{ inlineData: { data: string } }> } } } {
  return { serverContent: { modelTurn: { parts: [{ inlineData: { data: "AQACAA==" } }] } } };
}

describe("Gemini 2.5 inline completion recovery", () => {
  it("suppresses a premature turnComplete and requests continuation before playback can drain", () => {
    const { events, handle, sendClientContent } = createHarness();
    handle(audioChunk(), "greus-greeny", "Leda", MODEL);
    handle({ serverContent: { outputTranscription: { text: "그 이유는 여러 가지가 있는데" } } }, "greus-greeny", "Leda", MODEL);
    handle({ serverContent: { generationComplete: true, turnComplete: true } }, "greus-greeny", "Leda", MODEL);

    expect(sendClientContent).toHaveBeenCalledTimes(1);
    expect(sendClientContent.mock.calls[0]?.[0]).toMatchObject({ turnComplete: true });
    expect(events.some((event) => event.type === "generation-complete")).toBe(false);
    expect(events.some((event) => event.type === "turn-complete")).toBe(false);
  });

  it("lets a clearly complete 2.5 answer finish normally", () => {
    const { events, handle, sendClientContent } = createHarness();
    handle(audioChunk(), "greus-greeny", "Leda", MODEL);
    handle({ serverContent: { outputTranscription: { text: "응, 그렇게 하면 돼요." } } }, "greus-greeny", "Leda", MODEL);
    handle({ serverContent: { generationComplete: true, turnComplete: true } }, "greus-greeny", "Leda", MODEL);

    expect(sendClientContent).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === "generation-complete")).toBe(true);
    expect(events.some((event) => event.type === "turn-complete")).toBe(true);
  });

  it("bounds inline repair loops when the provider repeatedly ends mid-sentence", () => {
    const { events, handle, sendClientContent } = createHarness();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      handle(audioChunk(), "greus-greeny", "Leda", MODEL);
      handle({ serverContent: { outputTranscription: { text: attempt === 0 ? "설명하자면 여러 가지가 있는데" : "그리고 다음으로는" } } }, "greus-greeny", "Leda", MODEL);
      handle({ serverContent: { generationComplete: true, turnComplete: true } }, "greus-greeny", "Leda", MODEL);
    }

    expect(sendClientContent).toHaveBeenCalledTimes(2);
    expect(events.filter((event) => event.type === "turn-complete")).toHaveLength(1);
  });

  it("does not apply the 2.5 workaround to newer Live models", () => {
    const { events, handle, sendClientContent } = createHarness();
    const internals = (handle as unknown);
    void internals;
    const newer = "gemini-3.1-flash-live-preview";
    const adapter = new GeminiLiveAdapter();
    const raw = adapter as unknown as AdapterInternals;
    raw.ready = true;
    raw.activeModelId = newer;
    raw.session = {
      sendRealtimeInput: vi.fn(),
      sendClientContent,
      sendToolResponse: vi.fn(),
      close: vi.fn(),
    };
    const newerEvents: ProviderEvent[] = [];
    adapter.onEvent((event) => newerEvents.push(event));
    raw.handleMessage(audioChunk(), "greus-greeny", "Leda", newer);
    raw.handleMessage({ serverContent: { outputTranscription: { text: "아직 설명하고 있는데" }, turnComplete: true } }, "greus-greeny", "Leda", newer);

    expect(sendClientContent).not.toHaveBeenCalled();
    expect(newerEvents.some((event) => event.type === "turn-complete")).toBe(true);
    expect(events).toEqual([]);
  });
});
