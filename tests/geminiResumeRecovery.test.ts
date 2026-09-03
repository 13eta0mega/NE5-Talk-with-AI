import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock("@google/genai", () => ({
  Modality: { AUDIO: "AUDIO" },
  GoogleGenAI: class {
    live = { connect: sdk.connect };
  },
}));

import { GeminiLiveAdapter } from "../src/core/gemini/GeminiLiveAdapter";
import type { ProviderEvent } from "../src/core/types";

const staleCredentials = {
  token: "stale-token",
  model: "gemini-2.5-flash-native-audio-preview-12-2025",
  expiresAt: Date.now() + 60_000,
  hasResumeState: true,
};

const freshCredentials = {
  ...staleCredentials,
  token: "fresh-token",
  hasResumeState: false,
};

function installBridge(createLiveToken: ReturnType<typeof vi.fn>, update: ReturnType<typeof vi.fn>): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      deskPet: {
        auth: { createLiveToken },
        session: { update },
      },
    },
  });
}

describe("Gemini stale session recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sdk.connect.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clears a stalled resume handle and reconnects once with a fresh token", async () => {
    const createLiveToken = vi.fn()
      .mockResolvedValueOnce(staleCredentials)
      .mockResolvedValueOnce(freshCredentials);
    const update = vi.fn().mockResolvedValue({ ok: true });
    installBridge(createLiveToken, update);

    const freshSession = {
      sendRealtimeInput: vi.fn(),
      sendClientContent: vi.fn(),
      sendToolResponse: vi.fn(),
      close: vi.fn(),
    };
    sdk.connect
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce(freshSession);

    const adapter = new GeminiLiveAdapter();
    const events: ProviderEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    const connecting = adapter.connect("greus-greeny", "Zephyr", staleCredentials.model);

    await vi.advanceTimersByTimeAsync(6000);
    await connecting;

    expect(update).toHaveBeenCalledWith({ characterId: "greus-greeny", resumeHandle: null });
    expect(createLiveToken).toHaveBeenNthCalledWith(2, {
      characterId: "greus-greeny",
      voiceName: "Zephyr",
      modelId: staleCredentials.model,
      freshSession: true,
    });
    expect(sdk.connect).toHaveBeenCalledTimes(2);
    expect(adapter.isReady).toBe(true);
    expect(events).toContainEqual({ type: "connected", resumed: false });
  });

  it("does not hide a fresh-session connection failure behind another retry", async () => {
    const createLiveToken = vi.fn().mockResolvedValue(freshCredentials);
    const update = vi.fn().mockResolvedValue({ ok: true });
    installBridge(createLiveToken, update);
    sdk.connect.mockRejectedValue(new Error("fresh connection failed"));

    const adapter = new GeminiLiveAdapter();
    await expect(adapter.connect("greus-greeny", "Zephyr", freshCredentials.model))
      .rejects.toThrow("fresh connection failed");
    expect(createLiveToken).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });
});
