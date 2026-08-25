import { describe, expect, it, vi } from "vitest";
import { AudioGate } from "../src/core/audio/AudioGate";

describe("AudioGate", () => {
  it("sends zero microphone bytes while speaking", () => {
    const gate = new AudioGate();
    const send = vi.fn();
    gate.open();
    expect(gate.forward(new Int16Array(320), send)).toBe(true);
    gate.setSpeaking(true);
    expect(gate.forward(new Int16Array(320), send)).toBe(false);
    expect(gate.diagnostics().outgoingMicBytesDuringSpeaking).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not reopen until speaking is explicitly cleared", () => {
    const gate = new AudioGate();
    gate.setSpeaking(true);
    gate.open();
    expect(gate.diagnostics().open).toBe(false);
    gate.setSpeaking(false);
    gate.open();
    expect(gate.diagnostics().open).toBe(true);
  });

  it("keeps the microphone hard-muted for every frame of TTS playback", () => {
    const gate = new AudioGate();
    const send = vi.fn();
    const frame = new Int16Array(320);

    gate.open();
    gate.setSpeaking(true);

    for (let index = 0; index < 5; index += 1) {
      expect(gate.forward(frame, send)).toBe(false);
    }

    expect(send).not.toHaveBeenCalled();
    expect(gate.diagnostics()).toMatchObject({
      open: false,
      speaking: true,
      outgoingMicBytesDuringSpeaking: 0,
      droppedBytes: frame.byteLength * 5,
    });
  });

  it("requires an explicit reopen after TTS ends", () => {
    const gate = new AudioGate();
    const send = vi.fn();
    const frame = new Int16Array(320);

    gate.open();
    gate.setSpeaking(true);
    gate.setSpeaking(false);

    // Clearing the playback flag must not race with the next capture frame.
    expect(gate.forward(frame, send)).toBe(false);
    expect(send).not.toHaveBeenCalled();

    gate.open();
    expect(gate.forward(frame, send)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
