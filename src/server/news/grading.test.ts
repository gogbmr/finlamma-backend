import { describe, expect, it } from "vitest";
import { computeQualityGrade } from "./grading";

describe("computeQualityGrade", () => {
  it("grades A: multi-paragraph, has jargon, a real summary, no advice-like phrases", () => {
    expect(
      computeQualityGrade({
        bodyParagraphCount: 3,
        summaryWordCount: 20,
        hasJargon: true,
        adviceLikeWarningCount: 0,
      }),
    ).toBe("A");
  });

  it("grades B: thinner content but still substantive", () => {
    expect(
      computeQualityGrade({
        bodyParagraphCount: 1,
        summaryWordCount: 10,
        hasJargon: false,
        adviceLikeWarningCount: 0,
      }),
    ).toBe("B");
  });

  it("grades C: too thin for even a B", () => {
    expect(
      computeQualityGrade({
        bodyParagraphCount: 0,
        summaryWordCount: 3,
        hasJargon: false,
        adviceLikeWarningCount: 0,
      }),
    ).toBe("C");
  });

  it("caps at C whenever an advice-like phrase is present, even with otherwise-A content", () => {
    expect(
      computeQualityGrade({
        bodyParagraphCount: 3,
        summaryWordCount: 20,
        hasJargon: true,
        adviceLikeWarningCount: 1,
      }),
    ).toBe("C");
  });
});
