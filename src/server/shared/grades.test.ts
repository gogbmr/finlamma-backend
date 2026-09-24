import { describe, expect, it } from "vitest";
import { letterGradeForAccuracy } from "./grades";

describe("letterGradeForAccuracy", () => {
  it.each([
    [100, "S"],
    [95, "S"],
    [94, "A"],
    [83, "A"],
    [82, "B"],
    [67, "B"],
    [66, "C"],
    [0, "C"],
  ] as const)("%i%% -> %s", (pct, grade) => {
    expect(letterGradeForAccuracy(pct)).toBe(grade);
  });
});
