import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters/catalog";
import { COATS, IDLE_ACTIONS } from "../src/renderer/components/GreusCat";
import { PERSONA_IDS } from "../electron/personaVault";

describe("Greus Cat character replacement", () => {
  it("offers only the five Greus Cat coat variants", () => {
    expect(CHARACTERS).toHaveLength(5);
    expect(CHARACTERS.map((item) => item.coat)).toEqual([...COATS]);
    expect(CHARACTERS.every((item) => item.id.startsWith("greus-"))).toBe(true);
    expect(CHARACTERS.map((item) => item.id)).toEqual([...PERSONA_IDS]);
  });

  it("removes every legacy character asset and retains one semantic SVG rig", async () => {
    const legacyAssets = (await readdir(path.resolve("public/characters"))).filter((name) => name.endsWith(".svg"));
    expect(legacyAssets).toEqual([]);
    const source = await readFile(path.resolve("src/renderer/components/GreusCat.tsx"), "utf8");
    for (const id of ["rig-root", "body", "face", "mouth", "tail-base", "head-pet-hitbox"]) {
      expect(source).toContain(id);
    }
    expect(IDLE_ACTIONS).toHaveLength(7);
  });
});
