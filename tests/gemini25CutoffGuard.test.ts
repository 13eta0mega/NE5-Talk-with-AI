import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiLiveAdapter } from "../src/core/gemini/GeminiLiveAdapter";
import type { ProviderEvent } from "../src/core/types";

type AdapterInternals = {
  ready: boolean;
  session: {
    sendRealtimeInput(params: unknown): void;
    sendClientContent(params: unknown): void;
    sendToolResponse(params: unknown): void;
    close(): void;
  };
  handleMessage(message: Record<string, unknown>, characterId: string, voiceName: string, modelId: string): void;
};

function readyAdapter() {
  const adapter = new GeminiLiveAdapter();
  const internals = adapter as unknown as AdapterInternals;
  internals.ready = true;
  internals.session = {
    sendRealtimeInput: () => undefined,
    sendClientContent: () => undefined,
    sendToolResponse: () => undefined,
    close: () => undefined,
  };
  const events: ProviderEvent[] = [];
  adapter.onEvent((event) => events.push(event));
  return { adapter, events, handle: internals.handleMessage.bind(adapter) };
}

describe("Gemini 2.5 cutoff guards", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("gives interrupted strict precedence over completion flags in the same server message", () => {
    const { events, handle } = readyAdapter();
    handle({
      serverContent: {
        interrupted: true,
        generationComplete: true,
        turnComplete: true,
        waitingForInput: true,
      },
    }, "greus-greeny", "Leda", "gemini-2.5-flash-native-audio-preview-12-2025");

    expect(events.map((event) => event.type)).toEqual(["interrupted"]);
  });

  it("does not reconnect immediately when goAway provides several seconds of runway", async () => {
    const { events, handle } = readyAdapter();
    handle({ goAway: { timeLeftMs: 5000 } }, "greus-greeny", "Leda", "gemini-2.5-flash-native-audio-preview-12-2025");

    expect(events.some((event) => event.type === "go-away")).toBe(false);
    await vi.advanceTimersByTimeAsync(3799);
    expect(events.some((event) => event.type === "go-away")).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    const goAway = events.find((event): event is Extract<ProviderEvent, { type: "go-away" }> => event.type === "go-away");
    expect(goAway?.timeLeftMs).toBe(1200);
  });
});
