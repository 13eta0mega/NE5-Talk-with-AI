import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "../src/core/audio/AudioEngine";
import { AudioGate } from "../src/core/audio/AudioGate";
import { ConversationCoordinator, type ConversationSnapshot } from "../src/core/conversation/ConversationCoordinator";
import { GeminiLiveAdapter } from "../src/core/gemini/GeminiLiveAdapter";
import type { ProviderEvent } from "../src/core/types";

type CoordinatorInternals = {
  snapshot: ConversationSnapshot;
  desiredListening: boolean;
  autoReconnectAttempts: number;
};

function createTransportHarness() {
  let listener: ((event: ProviderEvent) => void) | undefined;
  const state = { ready: true };
  const sendText = vi.fn<(text: string) => void>();
  const sendPcm16 = vi.fn<(chunk: Int16Array) => void>();
  const connect = vi.fn(async () => {
    state.ready = true;
    listener?.({ type: "connected", resumed: false });
  });
  const close = vi.fn(async () => { state.ready = false; });
  const provider = {
    get isReady() { return state.ready; },
    onEvent(callback: (event: ProviderEvent) => void) { listener = callback; return () => undefined; },
    connect,
    close,
    sendText,
    sendPcm16,
    sendContinuationRecovery: vi.fn(),
    endInputAudio: vi.fn(),
  } as unknown as GeminiLiveAdapter;
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
  const coordinator = new ConversationCoordinator({ audio, provider });
  const internals = coordinator as unknown as CoordinatorInternals;
  return {
    audio,
    close,
    connect,
    coordinator,
    emit(event: ProviderEvent) { listener?.(event); },
    internals,
    sendPcm16,
    sendText,
    state,
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 16; index += 1) await Promise.resolve();
}

describe("continuous Gemini transport recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("recovers a socket race during text send without getting stuck thinking", async () => {
    const harness = createTransportHarness();
    harness.internals.snapshot = { ...harness.internals.snapshot, phase: "idle" };
    harness.sendText.mockImplementationOnce(() => { throw new Error("socket closed"); });

    const sending = harness.coordinator.sendText("다시 연결해 줘");
    await vi.advanceTimersByTimeAsync(350);
    await sending;

    expect(harness.connect).toHaveBeenCalledTimes(1);
    expect(harness.sendText).toHaveBeenCalledTimes(2);
    expect(harness.internals.snapshot.phase).toBe("thinking");
    expect(harness.internals.snapshot.error).toBeUndefined();
  });

  it("uses all three reconnect attempts instead of failing after the first transient error", async () => {
    const harness = createTransportHarness();
    harness.internals.snapshot = { ...harness.internals.snapshot, phase: "idle" };
    harness.state.ready = false;
    let attempts = 0;
    harness.connect.mockImplementation(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error(`temporary-${attempts}`);
      harness.state.ready = true;
      harness.emit({ type: "connected", resumed: false });
    });

    harness.emit({ type: "closed", code: 1006, reason: "network changed" });
    await vi.advanceTimersByTimeAsync(4000);
    await flushMicrotasks();

    expect(harness.connect).toHaveBeenCalledTimes(3);
    expect(harness.internals.snapshot.phase).toBe("idle");
    expect(harness.internals.snapshot.reconnectCount).toBe(1);
    expect(harness.internals.autoReconnectAttempts).toBe(0);
  });

  it("replays one unanswered chat message once after a mid-turn disconnect", async () => {
    const harness = createTransportHarness();
    harness.internals.snapshot = { ...harness.internals.snapshot, phase: "idle" };
    await harness.coordinator.sendText("대답을 이어가 줘");
    expect(harness.sendText).toHaveBeenCalledTimes(1);

    harness.state.ready = false;
    harness.emit({ type: "closed", code: 1006, reason: "connection lost" });
    await vi.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();

    expect(harness.connect).toHaveBeenCalledTimes(1);
    expect(harness.sendText).toHaveBeenCalledTimes(2);
    expect(harness.sendText).toHaveBeenLastCalledWith("대답을 이어가 줘");
    expect(harness.internals.snapshot.phase).toBe("thinking");
  });

  it("does not misclassify dropped microphone PCM as a completed user turn", async () => {
    const harness = createTransportHarness();
    harness.internals.desiredListening = true;
    harness.internals.snapshot = { ...harness.internals.snapshot, phase: "listening" };
    harness.state.ready = false;

    harness.audio.onCapturePcm?.(new Int16Array(640));

    expect(harness.sendPcm16).not.toHaveBeenCalled();
    expect(harness.internals.snapshot.phase).toBe("reconnecting");
    expect(harness.internals.snapshot.error).toContain("자동 재연결");
  });

  it("does not reconnect immediately on GoAway while current speech still has time to drain", async () => {
    const harness = createTransportHarness();
    harness.internals.snapshot = { ...harness.internals.snapshot, phase: "speaking" };

    harness.emit({ type: "go-away", timeLeftMs: 10_000 });
    await flushMicrotasks();
    expect(harness.internals.snapshot.phase).toBe("reconnecting");

    await vi.advanceTimersByTimeAsync(500);
    expect(harness.close).not.toHaveBeenCalled();
    expect(harness.connect).not.toHaveBeenCalled();
    expect(harness.audio.flushPlayback).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(8_300);
    await flushMicrotasks();
    expect(harness.close).toHaveBeenCalledTimes(1);
    expect(harness.connect).toHaveBeenCalledTimes(1);
  });
});
