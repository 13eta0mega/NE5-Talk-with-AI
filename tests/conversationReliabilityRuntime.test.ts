import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "../src/core/audio/AudioEngine";
import { AudioGate } from "../src/core/audio/AudioGate";
import { ConversationCoordinator, type ConversationSnapshot } from "../src/core/conversation/ConversationCoordinator";
import { GeminiLiveAdapter } from "../src/core/gemini/GeminiLiveAdapter";
import type { ProviderEvent } from "../src/core/types";

type CoordinatorInternals = {
  snapshot: ConversationSnapshot;
  desiredListening: boolean;
  armMicHealthCheck(): void;
};

function createHarness(options: { pause?: () => Promise<void> } = {}) {
  const log: string[] = [];
  const capture = { heartbeatFresh: true };
  const forceRestartCapture = vi.fn(async () => { log.push("capture:restart"); });
  const audio = {
    gate: new AudioGate(),
    onCapturePcm: undefined,
    onPlaybackStart: undefined,
    get captureHeartbeatFresh() { return capture.heartbeatFresh; },
    get captureActive() { return true; },
    get queueEmpty() { return false; },
    pauseCaptureForPlayback: options.pause ?? (async () => { log.push("capture:pause"); }),
    enqueuePcm24k: async () => { log.push("playback:enqueue"); },
    commitBufferedPlayback: async () => { log.push("playback:commit"); },
    waitForDrain: async () => undefined,
    forceRestartCapture,
    startCapture: async () => undefined,
    stopCapture: async () => undefined,
    preparePlayback: async () => undefined,
    unlockPlayback: async () => undefined,
    flushPlayback: () => { log.push("playback:flush"); },
    captureDiagnostics: () => ({}),
    dispose: async () => undefined,
  } as unknown as AudioEngine;

  let listener: ((event: ProviderEvent) => void) | undefined;
  const provider = {
    isReady: true,
    onEvent(callback: (event: ProviderEvent) => void) { listener = callback; return () => undefined; },
    endInputAudio: () => { log.push("provider:end-input"); },
    sendPcm16: () => undefined,
    sendText: () => undefined,
    sendContinuationRecovery: () => undefined,
    connect: async () => undefined,
    close: async () => undefined,
  } as unknown as GeminiLiveAdapter;

  const coordinator = new ConversationCoordinator({ audio, provider });
  return {
    coordinator,
    capture,
    forceRestartCapture,
    log,
    emit(event: ProviderEvent) { listener?.(event); },
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

describe("conversation runtime reliability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("serializes audio preparation before a following completion event", async () => {
    let releasePause!: () => void;
    let pauseStarted = false;
    let pauseEnded = false;
    const pause = new Promise<void>((resolve) => { releasePause = resolve; });
    const harness = createHarness({
      pause: async () => {
        pauseStarted = true;
        await pause;
        pauseEnded = true;
      },
    });

    harness.emit({ type: "audio", pcm: new Int16Array([1, 2, 3]) });
    harness.emit({ type: "generation-complete" });
    await flushMicrotasks();

    expect(pauseStarted).toBe(true);
    expect(harness.log).not.toContain("playback:commit");

    releasePause();
    await flushMicrotasks();

    expect(pauseEnded).toBe(true);
    expect(harness.log.indexOf("playback:enqueue")).toBeLessThan(harness.log.indexOf("playback:commit"));
  });

  it("keeps checking a healthy microphone and recovers a later stall", async () => {
    const harness = createHarness();
    const internals = harness.coordinator as unknown as CoordinatorInternals;
    internals.desiredListening = true;
    internals.snapshot = { ...internals.snapshot, phase: "listening" };
    internals.armMicHealthCheck();

    await vi.advanceTimersByTimeAsync(850);
    expect(harness.forceRestartCapture).not.toHaveBeenCalled();

    harness.capture.heartbeatFresh = false;
    await vi.advanceTimersByTimeAsync(850);
    expect(harness.forceRestartCapture).toHaveBeenCalledTimes(1);
  });

  it("retries playback preparation after a rejected capture pause", async () => {
    let pauseAttempts = 0;
    const harness = createHarness({
      pause: async () => {
        pauseAttempts += 1;
        if (pauseAttempts === 1) throw new Error("audio mode switch failed");
      },
    });

    harness.emit({ type: "audio", pcm: new Int16Array([1]) });
    await flushMicrotasks();
    harness.emit({ type: "audio", pcm: new Int16Array([2]) });
    await flushMicrotasks();

    expect(pauseAttempts).toBe(2);
    expect(harness.log).toContain("playback:enqueue");
  });

  it("times out when the playback worklet never reports a drain", async () => {
    const engine = new AudioEngine();
    (engine as unknown as { playbackEnded: boolean }).playbackEnded = false;
    const drained = engine.waitForDrain(0, 50);
    const rejection = expect(drained).rejects.toThrow("재생 종료 신호가 지연");

    await vi.advanceTimersByTimeAsync(50);
    await rejection;
  });
});
