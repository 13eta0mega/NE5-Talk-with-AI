import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("PWA update delivery", () => {
  it("keeps every required service-worker shell asset deployable", async () => {
    const source = await readFile(path.resolve("public/sw.js"), "utf8");
    const shellLiteral = source.match(/const SHELL = \[(.*?)\];/s)?.[1] ?? "";
    const shell = shellLiteral.match(/"([^"]+)"/g)?.map((entry) => JSON.parse(entry) as string) ?? [];

    expect(shell.length).toBeGreaterThan(0);
    await Promise.all(shell.map((url) => {
      const file = url === "/" || url === "/index.html"
        ? path.resolve("index.html")
        : path.resolve("public", url.slice(1));
      return access(file);
    }));
  });

  it("activates a new cache and refreshes controlled clients onto the new bundle", async () => {
    const worker = await readFile(path.resolve("public/sw.js"), "utf8");
    const entry = await readFile(path.resolve("src/renderer/main.tsx"), "utf8");

    expect(worker).toContain('CACHE_NAME = "deskpet-shell-v3"');
    expect(worker).toContain("self.skipWaiting()");
    expect(worker).toContain("self.clients.claim()");
    expect(entry).toContain('addEventListener("controllerchange"');
    expect(entry).toContain("window.location.reload()");
    expect(entry).toContain("registration.update()");
  });
});
