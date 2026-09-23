import { describe, expect, it } from "vitest";
import { daysBetweenIstDates, istDateString, istYearMonth } from "./ist-date";

describe("istDateString", () => {
  it("18:29 UTC is still the same IST calendar day (23:59 IST)", () => {
    // 2026-01-01T18:29:00Z + 5:30 = 2026-01-01T23:59:00 IST
    expect(istDateString(new Date("2026-01-01T18:29:00.000Z"))).toBe("2026-01-01");
  });

  it("18:31 UTC has already rolled into the next IST calendar day (00:01 IST)", () => {
    // 2026-01-01T18:31:00Z + 5:30 = 2026-01-02T00:01:00 IST
    expect(istDateString(new Date("2026-01-01T18:31:00.000Z"))).toBe("2026-01-02");
  });

  it("18:30:00 UTC exactly is the first instant of the new IST day (00:00:00 IST)", () => {
    expect(istDateString(new Date("2026-01-01T18:30:00.000Z"))).toBe("2026-01-02");
  });

  it("18:29:59.999 UTC is still the last instant of the old IST day (23:59:59.999 IST)", () => {
    expect(istDateString(new Date("2026-01-01T18:29:59.999Z"))).toBe("2026-01-01");
  });

  it("is computed from the server's own UTC clock, never a client-supplied timezone - " +
      "a UTC instant that's a DIFFERENT calendar day in another zone (e.g. US Pacific, UTC-8) " +
      "still buckets by IST, not by that other zone's local date", () => {
    // 2026-06-15T02:00:00Z is 2026-06-14 (evening) in US Pacific (UTC-7 in
    // June, DST) but 2026-06-15 07:30 in IST - IST's date must win.
    const instant = new Date("2026-06-15T02:00:00.000Z");
    expect(istDateString(instant)).toBe("2026-06-15");
  });

  it("defaults to the current instant when no date is passed", () => {
    expect(istDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("istYearMonth", () => {
  it("returns the IST calendar month, respecting the same day-boundary rules", () => {
    // 2026-01-31T18:31:00Z is 2026-02-01 00:01 IST - already February.
    expect(istYearMonth(new Date("2026-01-31T18:31:00.000Z"))).toBe("2026-02");
    expect(istYearMonth(new Date("2026-01-31T18:29:00.000Z"))).toBe("2026-01");
  });
});

describe("daysBetweenIstDates", () => {
  it("is 0 for the same date", () => {
    expect(daysBetweenIstDates("2026-01-05", "2026-01-05")).toBe(0);
  });

  it("is 1 for consecutive days", () => {
    expect(daysBetweenIstDates("2026-01-05", "2026-01-06")).toBe(1);
  });

  it("is 2 when exactly one day was skipped in between", () => {
    expect(daysBetweenIstDates("2026-01-05", "2026-01-07")).toBe(2);
  });

  it("handles a month/year boundary correctly", () => {
    expect(daysBetweenIstDates("2025-12-31", "2026-01-01")).toBe(1);
  });
});
