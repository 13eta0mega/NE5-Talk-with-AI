import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("character SVG assets", () => {
  it("ships fourteen semantic, editable SVGs", async () => {
    const directory = path.resolve("public/characters");
    const files = (await readdir(directory)).filter((name) => name.endsWith(".svg"));
    expect(files).toHaveLength(14);
    for (const file of files) {
      const svg = await readFile(path.join(directory, file), "utf8");
      expect(svg).toContain('id="pet-root"');
      expect(svg).toContain('id="body"');
      expect(svg).toContain('id="head"');
      expect(svg).toContain('id="face"');
      expect(svg).toContain('id="mouth"');
    }
  });
});
