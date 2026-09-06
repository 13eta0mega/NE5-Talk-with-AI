// Optional offline specimen bundle; this is NOT an entry in the production build.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  plugins: [react()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: { outDir: ".lumi-review", emptyOutDir: true, lib: { entry: resolve("tests/fixtures/lumi-harness.tsx"), formats: ["iife"], name: "LumiReview", fileName: () => "lumi-review.js" } },
});
