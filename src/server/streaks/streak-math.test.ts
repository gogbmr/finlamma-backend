import { describe, expect, it } from "vitest";
import { computeStreakTransition, effectiveFreezesLeft } from "./streak-math";

describe("computeStreakTransition", () => {
  it("treats a zero-or-negative gap as the same day", () => {
    expect(computeStreakTransition(0, 2)).toEqual({ kind: "same_day" });
  });

  it("extends without a freeze on a consecutive day", () => {
    expect(computeStreakTransition(1, 0)).toEqual({ kind: "extend", consumesFreeze: false });
  });

  it("extends with a freeze when exactly one day was missed and a freeze is available", () => {
    expect(computeStreakTransition(2, 1)).toEqual({ kind: "extend", consumesFreeze: true });
  });

  it("resets when exactly one day was missed but no freeze is available", () => {
    expect(computeStreakTransition(2, 0)).toEqual({ kind: "reset" });
  });

  it("resets on 2 missed days even with freezes available - never stacks freezes", () => {
    expect(computeStreakTransition(3, 5)).toEqual({ kind: "reset" });
  });

  it("resets on a 10-day gap regardless of freezes remaining", () => {
    expect(computeStreakTransition(10, 2)).toEqual({ kind: "reset" });
  });
});

describe("effectiveFreezesLeft", () => {
  it("returns the stored value when the reset month matches the as-of month", () => {
    expect(effectiveFreezesLeft(1, "2026-01", "2026-01-15", 2)).toBe(1);
  });

  it("returns the full allowance once the as-of date has crossed into a new month", () => {
    expect(effectiveFreezesLeft(0, "2025-12", "2026-01-02", 2)).toBe(2);
  });
});
