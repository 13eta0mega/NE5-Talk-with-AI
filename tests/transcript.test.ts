import { describe, expect, it } from "vitest";
import { mergeStreamingTranscript } from "../src/core/conversation/transcript";

describe("mergeStreamingTranscript", () => {
  it("appends Korean streaming chunks without replacing the sentence", () => {
    expect(mergeStreamingTranscript("오늘 정말", " 힘들었구나.")).toBe("오늘 정말 힘들었구나.");
  });

  it("accepts providers that resend the cumulative sentence", () => {
    expect(mergeStreamingTranscript("괜찮아", "괜찮아, 천천히 말해도 돼.")).toBe("괜찮아, 천천히 말해도 돼.");
  });

  it("deduplicates overlapping chunks", () => {
    expect(mergeStreamingTranscript("반가워요", "워요! 오늘 어땠어요?")).toBe("반가워요! 오늘 어땠어요?");
  });
});
