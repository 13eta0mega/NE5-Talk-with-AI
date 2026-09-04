import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "../src/core/audio/AudioEngine";
import { AudioGate } from "../src/core/audio/AudioGate";
import { ConversationCoordinator, type ConversationSnapshot } from "../src/core/conversation/ConversationCoordinator";
import {
  FIRST_PROACTIVE_IDLE_MS,
  installProactiveLiveConversation,
  proactiveIdlePrompt,
  uninstallProactiveLiveConversationForTests,
} from "../src/core/conversation/proactiveLive";
import { GeminiLiveAdapter } from "../src/core/gemini/GeminiLiveAdapter";
import type { ProviderEvent } from "../src/core/types";

type CoordinatorInternals = {
  snapshot: ConversationSnapshot;
  desiredListening: boolean;
};

function createHarness() {
  let providerListener: ((event: ProviderEvent) => void) | undefined;
  const sendText = vi.fn<(text: string) => void>();
  const endInputAudio = vi.fn();
  const audio = {
    gate: new AudioGate(),
    onCapturePcm: undefined,
    onPlaybackStart: undefined,
    get captureHeartbeatFresh() { return true; },
    get forwardedMicHeartbeatFresh() { return true; },
    get captureActive() { return true; },
    get queueEmpty() { return true; },
    preparePlayback: async () => undefined,
    unlockPlayback: async () => undefined,
    startCapture: async () => undefined,
    resumeCaptureForListening: async () => undefined,
    stopCapture: async () => undefined,
    forceRestartCapture: async () => undefined,
    pauseCaptureForPlayback: async () => undefined,
    enqueuePcm24k: async () => undefined,
    commitBufferedPlayback: async () => undefined,
    waitForDrain: async () => undefined,
    flushPlayback: vi.fn(),
    captureDiagnostics: () => ({}),
    dispose: async () => undefined,
  } as unknown as AudioEngine;
  const provider = {
    isReady: true,
    onEvent(callback: (event: ProviderEvent) => void) { providerListener = callback; return () => undefined; },
    connect: async () => { providerListener?.({ type: "connected", resumed: false }); },
    close: async () => undefined,
    sendPcm16: () => undefined,
    endInputAudio,
    sendText,
    sendContinuationRecovery: () => undefined,
  } as unknown as GeminiLiveAdapter;
  const coordinator = new ConversationCoordinator({ audio, provider });
  const internals = coordinator as unknown as CoordinatorInternals;
  internals.desiredListening = true;
  internals.snapshot = {
    phase: "listening",
    inputTranscript: "",
    outputTranscript: "",
    resumed: false,
    reconnectCount: 0,
  };
  return { audio, coordinator, endInputAudio, internals, sendText };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 16; index += 1) await Promise.resolve();
}

describe("proactive companion runtime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
    installProactiveLiveConversation();
  });

  afterEach(() => {
    uninstallProactiveLiveConversationForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts a coordinator-owned proactive turn exactly after the first idle window", async () => {
    const harness = createHarness();
    let latest: ConversationSnapshot | undefined;
    harness.coordinator.subscribe((snapshot) => { latest = snapshot; });

    await vi.advanceTimersByTimeAsync(FIRST_PROACTIVE_IDLE_MS - 1);
    expect(harness.sendText).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await flushMicrotasks();

    expect(harness.sendText).toHaveBeenCalledTimes(1);
    expect(harness.sendText).toHaveBeenCalledWith(proactiveIdlePrompt());
    expect(harness.endInputAudio).toHaveBeenCalledTimes(1);
    expect(harness.audio.flushPlayback).toHaveBeenCalled();
    expect(latest?.phase).toBe("thinking");
    expect(latest?.inputTranscript).not.toContain("DESKPET_INTERNAL_IDLE_NUDGE");
  });

  it("restarts the idle clock when a real user transcript arrives", async () => {
    const harness = createHarness();
    harness.coordinator.subscribe(() => undefined);

    await vi.advanceTimersByTimeAsync(20_000);
    harness.internals.snapshot = { ...harness.internals.snapshot, inputTranscript: "아까 하던 이야기 계속해 줘" };
    (harness.coordinator as unknown as { update(patch: Partial<ConversationSnapshot>): void }).update({
      inputTranscript: "아까 하던 이야기 계속해 줘",
    });

    await vi.advanceTimersByTimeAsync(10_001);
    expect(harness.sendText).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(19_999);
    await flushMicrotasks();
    expect(harness.sendText).toHaveBeenCalledTimes(1);
  });
});
