import { describe, expect, it } from "vitest";
import { validateAnswerBounds } from "./schemas";

const T = { en: "en", hi: "hi", hx: "hx" };

describe("validateAnswerBounds", () => {
  describe("single_select", () => {
    it("accepts an in-range correctIndex", () => {
      expect(validateAnswerBounds("single_select", { options: [T, T] }, { correctIndex: 1 })).toEqual([]);
    });

    it("rejects an out-of-range correctIndex", () => {
      const errors = validateAnswerBounds("single_select", { options: [T, T] }, { correctIndex: 2 });
      expect(errors).toEqual([expect.stringMatching(/correctIndex.*out of range/)]);
    });

    it("returns [] (structural errors handled elsewhere) for a malformed payload", () => {
      expect(validateAnswerBounds("single_select", { options: "not an array" }, { correctIndex: 0 })).toEqual([]);
    });
  });

  describe("ordering", () => {
    it("accepts a valid permutation", () => {
      expect(
        validateAnswerBounds("ordering", { pool: [T, T, T] }, { correctOrder: [2, 0, 1] }),
      ).toEqual([]);
    });

    it("rejects a wrong-length order", () => {
      const errors = validateAnswerBounds("ordering", { pool: [T, T, T] }, { correctOrder: [0, 1] });
      expect(errors).toEqual([expect.stringMatching(/has 2 entries but the pool has 3/)]);
    });

    it("rejects a non-permutation (duplicate index)", () => {
      const errors = validateAnswerBounds("ordering", { pool: [T, T, T] }, { correctOrder: [0, 0, 1] });
      expect(errors).toEqual([expect.stringMatching(/must use every pool index exactly once/)]);
    });

    it("rejects a non-permutation (index out of range)", () => {
      const errors = validateAnswerBounds("ordering", { pool: [T, T, T] }, { correctOrder: [0, 1, 5] });
      expect(errors).toEqual([expect.stringMatching(/must use every pool index exactly once/)]);
    });
  });

  describe("sort_buckets", () => {
    it("accepts a matching-length mapping", () => {
      expect(
        validateAnswerBounds(
          "sort_buckets",
          { items: [T, T, T], buckets: [T, T] },
          { bucketByItemIndex: [0, 1, 0] },
        ),
      ).toEqual([]);
    });

    it("rejects a wrong-length mapping", () => {
      const errors = validateAnswerBounds(
        "sort_buckets",
        { items: [T, T, T], buckets: [T, T] },
        { bucketByItemIndex: [0, 1] },
      );
      expect(errors).toEqual([expect.stringMatching(/has 2 entries but there are 3 items/)]);
    });
  });

  describe("fill_blank", () => {
    it("accepts the correct blank count and in-range pool indices", () => {
      // 3 sentence parts frame 2 blanks
      expect(
        validateAnswerBounds(
          "fill_blank",
          { sentenceParts: [T, T, T], pool: [T, T] },
          { correctFillIndices: [0, 1] },
        ),
      ).toEqual([]);
    });

    it("rejects the wrong blank count", () => {
      const errors = validateAnswerBounds(
        "fill_blank",
        { sentenceParts: [T, T, T], pool: [T, T] },
        { correctFillIndices: [0] },
      );
      expect(errors).toEqual([expect.stringMatching(/has 1 entries but 3 sentence parts frame 2 blank/)]);
    });

    it("rejects an out-of-range pool index", () => {
      const errors = validateAnswerBounds(
        "fill_blank",
        { sentenceParts: [T, T], pool: [T] },
        { correctFillIndices: [5] },
      );
      expect(errors).toEqual([expect.stringMatching(/correctFillIndices\[0\].*out of range for 1 pool/)]);
    });
  });

  describe("match_pairs", () => {
    it("accepts a matching-length, in-range mapping", () => {
      expect(
        validateAnswerBounds(
          "match_pairs",
          { left: [T, T], right: [T, T, T] },
          { rightIndexByLeftIndex: [2, 0] },
        ),
      ).toEqual([]);
    });

    it("rejects a wrong-length mapping", () => {
      // rightIndexByLeftIndex has its own min(2), so a "too short" mapping
      // is exercised as "too long" instead - 3 entries for 2 left items -
      // to actually reach bounds checking rather than failing the
      // structural parse first (which validateAnswerBounds correctly
      // leaves to the caller's own structural error reporting).
      const errors = validateAnswerBounds(
        "match_pairs",
        { left: [T, T], right: [T, T] },
        { rightIndexByLeftIndex: [0, 1, 0] },
      );
      expect(errors).toEqual([expect.stringMatching(/has 3 entries but there are 2 left items/)]);
    });

    it("rejects an out-of-range right index", () => {
      const errors = validateAnswerBounds(
        "match_pairs",
        { left: [T, T], right: [T, T] },
        { rightIndexByLeftIndex: [0, 5] },
      );
      expect(errors).toEqual([expect.stringMatching(/rightIndexByLeftIndex\[1\].*out of range for 2 right/)]);
    });
  });

  describe("spot_mistake", () => {
    it("accepts an in-range wrongLineIndex", () => {
      expect(validateAnswerBounds("spot_mistake", { lines: [T, T, T] }, { wrongLineIndex: 2 })).toEqual([]);
    });

    it("rejects an out-of-range wrongLineIndex", () => {
      const errors = validateAnswerBounds("spot_mistake", { lines: [T, T] }, { wrongLineIndex: 2 });
      expect(errors).toEqual([expect.stringMatching(/wrongLineIndex.*out of range for 2 lines/)]);
    });
  });
});
