import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "../src/core/audio/AudioEngine";
import { AudioGate } from "../src/core/audio/AudioGate";
import { ConversationCoordinator, type ConversationSnapshot } from "../src/core/conversation/ConversationCoordinator";
import { GeminiLiveAdapter } from "../src/core/gemini/GeminiLiveAdapter";
import { GEMINI_25_LIVE_MODEL } from "../src/core/gemini/catalog";
import type { ProviderEvent } from "../src/core/types";

function pcm(amplitude: number, samples = 320): Int16Array {
  const out = new Int16Array(samples);
  for (let index = 0; index < samples; index += 1) out[index] = index % 2 ? amplitude : -amplitude;
  return out;
}

function createHarness() {
  let providerListener: ((event: ProviderEvent) => void) | undefined;
  const sentPcm: Int16Array[] = [];
  const endInputAudio = vi.fn();
  const audio = {
    gate: new AudioGate(),
    onCapturePcm: undefined as ((chunk: Int16Array) => void) | undefined,
    onPlaybackStart: undefined as (() => void) | undefined,
    get captureHeartbeatFresh() { return true; },
    get captureActive() { return true; },
    get queueEmpty() { return true; },
    preparePlayback: async () => undefined,
    unlockPlayback: async () => undefined,
    startCapture: async () => undefined,
    stopCapture: async () => undefined,
    forceRestartCapture: async () => undefined,
    pauseCaptureForPlayback: async () => undefined,
    enqueuePcm24k: async () => undefined,
    commitBufferedPlayback: async () => undefined,
    waitForDrain: async () => undefined,
    flushPlayback: () => undefined,
    captureDiagnostics: () => ({}),
    dispose: async () => undefined,
  } as unknown as AudioEngine;
  const provider = {
    isReady: true,
    onEvent(callback: (event: ProviderEvent) => void) { providerListener = callback; return () => undefined; },
    connect: async () => { providerListener?.({ type: "connected", resumed: false }); },
    close: async () => undefined,
    sendPcm16: (chunk: Int16Array) => { sentPcm.push(chunk); },
    endInputAudio,
    sendText: () => undefined,
    sendContinuationRecovery: () => undefined,
  } as unknown as GeminiLiveAdapter;
  const coordinator = new ConversationCoordinator({ audio, provider });
  let latest: ConversationSnapshot | undefined;
  coordinator.subscribe((snapshot) => { latest = snapshot; });
  return { coordinator, audio, sentPcm, endInputAudio, snapshot: () => latest! };
}

async function beginListening(harness: ReturnType<typeof createHarness>) {
  await harness.coordinator.connect("greus-greeny", "Leda", GEMINI_25_LIVE_MODEL);
  await Promise.resolve();
  await harness.coordinator.startListening("default");
  expect(harness.snapshot().phase).toBe("listening");
}

describe("Gemini 2.5 idle microphone runtime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stays listening through 30 seconds of silence", async () => {
    const harness = createHarness();
    await beginListening(harness);
    for (let chunk = 0; chunk < 1500; chunk += 1) harness.audio.onCapturePcm?.(pcm(0));
    expect(harness.snapshot().phase).toBe("listening");
    expect(harness.endInputAudio).not.toHaveBeenCalled();
    expect(harness.sentPcm).toHaveLength(1500);
  });

  it("stays listening after a false local speech spike followed by 30 seconds of silence", async () => {
    const harness = createHarness();
    await beginListening(harness);
    harness.audio.onCapturePcm?.(pcm(5000));
    harness.audio.onCapturePcm?.(pcm(5000));
    harness.audio.onCapturePcm?.(pcm(5000));
    for (let chunk = 0; chunk < 1500; chunk += 1) harness.audio.onCapturePcm?.(pcm(0));
    expect(harness.snapshot().phase).toBe("listening");
    expect(harness.endInputAudio).not.toHaveBeenCalled();
  });

  it("repeats the 30-second false-spike scenario 100 times without entering thinking", async () => {
    for (let run = 0; run < 100; run += 1) {
      const harness = createHarness();
      await beginListening(harness);
      for (let chunk = 0; chunk < 1500; chunk += 1) {
        const amplitude = chunk === 20 || chunk === 21 || chunk === 22 ? 5000 : chunk % 211 === 0 ? 300 : 0;
        harness.audio.onCapturePcm?.(pcm(amplitude));
      }
      expect(harness.snapshot().phase).toBe("listening");
      expect(harness.endInputAudio).not.toHaveBeenCalled();
      await harness.coordinator.dispose();
    }
  });
});
