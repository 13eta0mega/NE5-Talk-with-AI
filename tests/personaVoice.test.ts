import { describe, expect, it } from "vitest";
import { buildSystemInstruction } from "../electron/personaVault";

describe("GreenCat voice direction", () => {
  it("defines a stable acted Korean character voice instead of repeated cat sounds", () => {
    const prompt = buildSystemInstruction("greus-greeny");

    expect(prompt).toContain("그린냥");
    expect(prompt).toContain("youthful young-adult");
    expect(prompt).toContain("vocal smile");
    expect(prompt).toContain("대본을 낭독하는 사람이 아니라");
    expect(prompt).toContain("동일한 그린냥의 목소리로 알아볼 수 있어야 한다");
    expect(prompt).toContain("\"냥냥\"을 대사처럼 읽거나");
    expect(prompt).toContain("고객센터 상담원");
  });

  it("keeps continuity memory separated from spoken dialogue", () => {
    const prompt = buildSystemInstruction("greus-greeny", "사용자는 별을 좋아한다.");
    expect(prompt).toContain("# Continuity Memory");
    expect(prompt).toContain("그대로 읽어주지 않는다");
  });
});
