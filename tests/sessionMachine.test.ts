import { describe, expect, it } from "vitest";
import { nextPhase } from "../src/core/session/sessionMachine";

describe("session phase machine", () => {
  it("follows the half-duplex happy path", () => {
    expect(nextPhase("disconnected", "CONNECT")).toBe("connecting");
    expect(nextPhase("connecting", "CONNECTED")).toBe("idle");
    expect(nextPhase("idle", "START_LISTENING")).toBe("listening");
    expect(nextPhase("listening", "USER_SPEECH_END")).toBe("thinking");
    expect(nextPhase("thinking", "MODEL_AUDIO_START")).toBe("speaking");
    expect(nextPhase("speaking", "PLAYBACK_DRAINED")).toBe("listening");
  });

  it("returns from thinking when a turn completes without model audio", () => {
    expect(nextPhase("thinking", "PLAYBACK_DRAINED")).toBe("listening");
  });

  it("treats reconnect as a normal path", () => {
    expect(nextPhase("speaking", "RECONNECT")).toBe("reconnecting");
    expect(nextPhase("reconnecting", "RECONNECTED")).toBe("idle");
  });

  it("can resume listening after the reconnect acknowledgement", () => {
    let phase = nextPhase("listening", "RECONNECT");
    expect(phase).toBe("reconnecting");

    phase = nextPhase(phase, "RECONNECTED");
    expect(phase).toBe("idle");
    expect(nextPhase(phase, "START_LISTENING")).toBe("listening");
  });

  it("ignores a late reconnect acknowledgement after a disconnect", () => {
    const disconnected = nextPhase(nextPhase("speaking", "RECONNECT"), "DISCONNECT");
    expect(disconnected).toBe("disconnected");
    expect(nextPhase(disconnected, "RECONNECTED")).toBe("disconnected");
  });
});
