import { describe, expect, it } from "vitest";
import { readDateRangeFilter } from "./date-range";

describe("readDateRangeFilter", () => {
  it("returns both bounds for a valid, well-ordered range", () => {
    const result = readDateRangeFilter({ from: "2026-06-01", to: "2026-06-30" });
    expect(result.from).toEqual(new Date("2026-06-01T00:00:00.000Z"));
    expect(result.to).toEqual(new Date("2026-06-30T00:00:00.000Z"));
  });

  it("allows from === to (a single day)", () => {
    const result = readDateRangeFilter({ from: "2026-06-01", to: "2026-06-01" });
    expect(result.from).not.toBeNull();
    expect(result.to).not.toBeNull();
  });

  it("falls back to no filter when nothing is provided", () => {
    expect(readDateRangeFilter({})).toEqual({ from: null, to: null });
  });

  it("falls back to no filter when only one side is provided", () => {
    expect(readDateRangeFilter({ from: "2026-06-01" })).toEqual({ from: null, to: null });
    expect(readDateRangeFilter({ to: "2026-06-30" })).toEqual({ from: null, to: null });
  });

  it("falls back to no filter when from > to, rather than erroring", () => {
    const result = readDateRangeFilter({ from: "2026-06-30", to: "2026-06-01" });
    expect(result).toEqual({ from: null, to: null });
  });

  it("falls back to no filter for a malformed date string, rather than erroring", () => {
    expect(readDateRangeFilter({ from: "not-a-date", to: "2026-06-30" })).toEqual({
      from: null,
      to: null,
    });
    expect(readDateRangeFilter({ from: "2026-06-01", to: "2026-13-99" })).toEqual({
      from: null,
      to: null,
    });
  });

  it("falls back to no filter for a datetime string (only a plain date is accepted)", () => {
    const result = readDateRangeFilter({
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-30",
    });
    expect(result).toEqual({ from: null, to: null });
  });

  it("falls back to no filter for a range wider than MAX_DATE_RANGE_DAYS", () => {
    const result = readDateRangeFilter({ from: "2020-01-01", to: "2026-01-01" });
    expect(result).toEqual({ from: null, to: null });
  });

  it("allows a range right at the MAX_DATE_RANGE_DAYS boundary", () => {
    const result = readDateRangeFilter({ from: "2026-01-01", to: "2027-01-01" });
    expect(result.from).not.toBeNull();
    expect(result.to).not.toBeNull();
  });

  it("supports custom param key names", () => {
    const result = readDateRangeFilter(
      { requestedFrom: "2026-06-01", requestedTo: "2026-06-30" },
      "requestedFrom",
      "requestedTo",
    );
    expect(result.from).not.toBeNull();
    expect(result.to).not.toBeNull();
  });

  it("reads the first value when a param arrives as an array", () => {
    const result = readDateRangeFilter({ from: ["2026-06-01", "ignored"], to: "2026-06-30" });
    expect(result.from).toEqual(new Date("2026-06-01T00:00:00.000Z"));
  });

  it("never throws on garbage input", () => {
    expect(() =>
      readDateRangeFilter({ from: "<script>alert(1)</script>", to: "'; DROP TABLE users; --" }),
    ).not.toThrow();
  });
});
