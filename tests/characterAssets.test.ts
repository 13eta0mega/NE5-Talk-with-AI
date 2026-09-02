import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters/catalog";
import { COATS, IDLE_ACTIONS, MICROPHONE_TRIGGER_THRESHOLD } from "../src/renderer/components/GreusCat";
import { ORIGINAL_SPEECH_LEVEL } from "../src/renderer/components/PetStage";
import { PERSONA_IDS } from "../electron/personaVault";

describe("Greus Cat character replacement", () => {
  it("offers only the five Greus Cat coat variants", () => {
    expect(CHARACTERS).toHaveLength(5);
    expect(CHARACTERS.map((item) => item.coat)).toEqual([...COATS]);
    expect(CHARACTERS.every((item) => item.id.startsWith("greus-"))).toBe(true);
    expect(CHARACTERS.map((item) => item.id)).toEqual([...PERSONA_IDS]);
    expect(CHARACTERS[0].displayName).toBe("그린냥");
  });

  it("removes every legacy character asset and retains one semantic SVG rig", async () => {
    const legacyAssets = (await readdir(path.resolve("public/characters"))).filter((name) => name.endsWith(".svg"));
    expect(legacyAssets).toEqual([]);
    const source = await readFile(path.resolve("src/renderer/components/GreusCat.tsx"), "utf8");
    for (const id of ["rig-root", "body", "face", "mouth", "tail-base", "head-pet-hitbox"]) {
      expect(source).toContain(id);
    }
    expect(IDLE_ACTIONS).toHaveLength(7);
    expect(source).toMatch(/if \(isSpeaking[\s\S]*?mouthLine: speakingFace\.mouthLine/);
    expect(source).toContain('id={speakingMouthClipId}');
    expect(source).toContain('M109 139.35 L111.5 139.35 C114 140.7 117 141.15 120 139.35 C123 141.15 126 140.7 128.5 139.35');
    expect(source).toContain('clipPath={isSpeaking && activeIdleAction !== "yawn" ? `url(#${speakingMouthClipId})`');
    expect(source).toContain('"--cat-mouth-soft-y"');
    expect(source).toContain("microphonePeakRef");
    expect(MICROPHONE_TRIGGER_THRESHOLD).toBeLessThan(.1);
  });

  it("uses the source animator's exact tuned speech level", () => {
    expect(ORIGINAL_SPEECH_LEVEL).toBe(.72);
  });

  it("keeps the source mouth cycle level-aware and isolated from yawn", async () => {
    const css = await readFile(path.resolve("src/renderer/components/greeny-animal.css"), "utf8");
    expect(css).toContain('translateY(var(--cat-mouth-soft-y))');
    expect(css).toContain('scaleY(var(--cat-mouth-lip-open))');
    expect(css).toContain('[data-speaking="true"]:not([data-idle-action="yawn"]) .morph-mouth-opening');
  });
});
