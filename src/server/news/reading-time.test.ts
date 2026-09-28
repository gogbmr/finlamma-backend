import { describe, expect, it } from "vitest";
import { computeMinReadSeconds, countWords } from "./reading-time";

describe("countWords", () => {
  it("counts whitespace-separated words", () => {
    expect(countWords("RBI held the repo rate steady today.")).toBe(7);
  });

  it("returns 0 for an empty string", () => {
    expect(countWords("")).toBe(0);
  });
});

describe("computeMinReadSeconds", () => {
  it("floors at 15 seconds for very short content", () => {
    expect(computeMinReadSeconds(["Short."])).toBe(15);
  });

  it("caps at 60 seconds for very long content", () => {
    const longParagraph = "word ".repeat(500);
    expect(computeMinReadSeconds([longParagraph])).toBe(60);
  });

  it("scales with total word count across every paragraph", () => {
    const oneParagraph = computeMinReadSeconds(["word ".repeat(40)]);
    const twoParagraphs = computeMinReadSeconds(["word ".repeat(40), "word ".repeat(40)]);
    expect(twoParagraphs).toBeGreaterThan(oneParagraph);
  });
});
