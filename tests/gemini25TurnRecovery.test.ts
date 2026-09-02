import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GEMINI25_AUDIO_IDLE_COMMIT_MS,
  GEMINI25_MAX_COMPLETION_REPAIRS,
  looksLikePrematureCutoff,
} from "../src/core/conversation/responseCompletion";

describe("Gemini 2.5 turn recovery", () => {
  it("detects strong signs of a response cut off mid-sentence", () => {
    expect(looksLikePrematureCutoff("무슨 흥미로운 얘기가")).toBe(true);
    expect(looksLikePrematureCutoff("그 이유는 여러 가지가 있는데")).toBe(true);
    expect(looksLikePrematureCutoff("응, 그건 정말 재미있어!")).toBe(false);
    expect(looksLikePrematureCutoff("그렇게 하면 돼요")).toBe(false);
  });

  it("uses a bounded repair and sub-second idle completion fallback", () => {
    expect(GEMINI25_MAX_COMPLETION_REPAIRS).toBe(1);
    expect(GEMINI25_AUDIO_IDLE_COMMIT_MS).toBeLessThan(1000);
  });

  it("does not invalidate playback completion for every incoming audio chunk", async () => {
    const coordinator = await readFile(path.resolve("src/core/conversation/ConversationCoordinator.ts"), "utf8");
    const audioCase = coordinator.slice(coordinator.indexOf('case "audio"'), coordinator.indexOf('case "generation-complete"'));
    expect(audioCase).not.toContain("playbackEpoch += 1");
    expect(audioCase).toContain("armAudioIdleCommitTimer(this.playbackEpoch)");
    expect(coordinator).toContain("TURN_COMPLETE_GRACE_MS = 240");
    expect(coordinator).toContain("PLAYBACK_TAIL_GUARD_MS = 40");
  });

  it("continues a strongly truncated 2.5 response once without reopening the mic first", async () => {
    const coordinator = await readFile(path.resolve("src/core/conversation/ConversationCoordinator.ts"), "utf8");
    expect(coordinator).toContain("repairPrematureGemini25Turn");
    expect(coordinator).toContain("this.provider.sendContinuationRecovery()");
    expect(coordinator).toContain("this.audio.gate.close()");
  });

  it("shows the real microphone-ready state instead of only the phase", async () => {
    const app = await readFile(path.resolve("src/renderer/App.tsx"), "utf8");
    expect(app).toContain("const micReady =");
    expect(app).toContain("coordinator.audio.captureActive");
    expect(app).toContain("micDiagnostics.open");
    expect(app).toContain("마이크 입력 가능");
  });
});
