import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Gemini Live response completion", () => {
  it("disables automatic barge-in in both the browser config and ephemeral token constraints", async () => {
    const adapter = await readFile(path.resolve("src/core/gemini/GeminiLiveAdapter.ts"), "utf8");
    const token = await readFile(path.resolve("api/live-token.ts"), "utf8");

    for (const source of [adapter, token]) {
      expect(source).toContain('activityHandling: "NO_INTERRUPTION"');
      expect(source).toContain("automaticActivityDetection");
    }
  });

  it("does not flush already-buffered model speech on waitingForInput", async () => {
    const coordinator = await readFile(path.resolve("src/core/conversation/ConversationCoordinator.ts"), "utf8");
    const start = coordinator.indexOf("private async settleWaitingForInput");
    const end = coordinator.indexOf("private async repairPrematureGemini25Turn", start);
    const waitingHandler = coordinator.slice(start, end);

    expect(waitingHandler).toContain("if (!this.audio.queueEmpty || this.snapshot.phase === \"speaking\")");
    expect(waitingHandler).toContain("this.generationComplete = true");
    expect(waitingHandler).toContain("await this.commitPlaybackAndFinish(this.playbackEpoch)");
    expect(waitingHandler).not.toContain("flushPlayback");
  });

  it("still flushes immediately on an explicit Gemini interruption", async () => {
    const coordinator = await readFile(path.resolve("src/core/conversation/ConversationCoordinator.ts"), "utf8");
    const interrupted = coordinator.slice(
      coordinator.indexOf('case "interrupted"'),
      coordinator.indexOf('case "input-transcript"'),
    );
    expect(interrupted).toContain("this.audio.flushPlayback()");
  });
});
