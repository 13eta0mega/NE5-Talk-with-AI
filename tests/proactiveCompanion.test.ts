import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSystemInstruction } from "../electron/personaVault";
import {
  FIRST_PROACTIVE_IDLE_MS,
  FOLLOWUP_PROACTIVE_IDLE_MS,
  MAX_PROACTIVE_IDLE_NUDGES,
  proactiveIdleDelayMs,
  proactiveIdlePrompt,
} from "../src/core/conversation/proactiveLive";
import { normalizeUserName } from "../src/renderer/components/UserNameSetting";

describe("proactive DeskPet companion", () => {
  it("starts the first proactive turn after 30 seconds and spaces later nudges", () => {
    expect(FIRST_PROACTIVE_IDLE_MS).toBe(30_000);
    expect(FOLLOWUP_PROACTIVE_IDLE_MS).toBeGreaterThan(FIRST_PROACTIVE_IDLE_MS);
    expect(proactiveIdleDelayMs(0)).toBe(30_000);
    expect(proactiveIdleDelayMs(1)).toBe(FOLLOWUP_PROACTIVE_IDLE_MS);
    expect(proactiveIdleDelayMs(MAX_PROACTIVE_IDLE_NUDGES)).toBeUndefined();
  });

  it("keeps the idle prompt contextual and hides timer implementation details", () => {
    const prompt = proactiveIdlePrompt();
    expect(prompt).toContain("최근 대화 맥락");
    expect(prompt).toContain("후속 질문");
    expect(prompt).toContain("흥얼");
    expect(prompt).toContain("내부 사정은 절대 말하지 않는다");
  });

  it("routes idle nudges through the coordinator rather than writing directly to the provider", async () => {
    const source = await readFile(path.resolve("src/core/conversation/proactiveLive.ts"), "utf8");
    expect(source).toContain("ConversationCoordinator.prototype");
    expect(source).toContain("originalSendText.call(instance, INTERNAL_IDLE_PROMPT)");
    expect(source).not.toContain("GeminiLiveAdapter.prototype");
  });

  it("normalizes and bounds persisted user names", () => {
    expect(normalizeUserName("  주안\n 님  ")).toBe("주안 님");
    expect(normalizeUserName("가".repeat(100))).toHaveLength(40);
  });

  it("injects persistent user identity and proactive dialogue rules into both Live generations", () => {
    const instruction = buildSystemInstruction("greus-greeny", undefined, false, "default", "주안");
    expect(instruction).toContain('사용자의 이름은 "주안"');
    expect(instruction).toContain("최근 2~4턴");
    expect(instruction).toContain("관련 질문이나 관찰");
    expect(instruction).toContain("보통 2~5개의 짧은 문장");
  });
});
