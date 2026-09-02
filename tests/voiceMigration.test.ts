import { afterEach, describe, expect, it, vi } from "vitest";
import { readStoredSettings } from "../src/mobile/installMobileBridge";

function storageWith(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("character voice profile migration", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("moves the previous Kore default to the recommended Leda profile once", () => {
    const storage = storageWith({
      "deskpet:mobile-settings:v1": JSON.stringify({ selectedVoiceName: "Kore" }),
    });
    vi.stubGlobal("localStorage", storage);

    expect(readStoredSettings().selectedVoiceName).toBe("Leda");
    expect(storage.getItem("deskpet:voice-profile-version")).toBe("2");
  });

  it("preserves an explicitly selected non-legacy voice", () => {
    vi.stubGlobal("localStorage", storageWith({
      "deskpet:mobile-settings:v1": JSON.stringify({ selectedVoiceName: "Zephyr" }),
    }));

    expect(readStoredSettings().selectedVoiceName).toBe("Zephyr");
  });
});
