import { describe, expect, it } from "vitest";
import { isMarketOpen } from "./hours";

const NO_HOLIDAYS = new Set<string>();

describe("isMarketOpen", () => {
  it("is open at 09:15 IST on a Monday (market open, exact boundary)", () => {
    // 2026-09-21 is a Monday. 09:15 IST = 03:45 UTC.
    expect(isMarketOpen(new Date("2026-09-21T03:45:00.000Z"), NO_HOLIDAYS)).toBe(true);
  });

  it("is open at 15:29 IST on a Monday, just before close", () => {
    expect(isMarketOpen(new Date("2026-09-21T09:59:00.000Z"), NO_HOLIDAYS)).toBe(true);
  });

  it("is closed at 15:30 IST on a Monday (exact close boundary, exclusive)", () => {
    expect(isMarketOpen(new Date("2026-09-21T10:00:00.000Z"), NO_HOLIDAYS)).toBe(false);
  });

  it("is closed at 09:14 IST on a Monday, just before open", () => {
    expect(isMarketOpen(new Date("2026-09-21T03:44:00.000Z"), NO_HOLIDAYS)).toBe(false);
  });

  it("is closed on a Saturday during normal trading hours", () => {
    // 2026-09-19 is a Saturday.
    expect(isMarketOpen(new Date("2026-09-19T06:00:00.000Z"), NO_HOLIDAYS)).toBe(false);
  });

  it("is closed on a Sunday during normal trading hours", () => {
    // 2026-09-20 is a Sunday.
    expect(isMarketOpen(new Date("2026-09-20T06:00:00.000Z"), NO_HOLIDAYS)).toBe(false);
  });

  it("is closed on a listed market holiday even during normal trading hours", () => {
    const holidays = new Set(["2026-10-02"]); // a Friday, Mahatma Gandhi Jayanti
    expect(isMarketOpen(new Date("2026-10-02T06:00:00.000Z"), holidays)).toBe(false);
  });

  it("is open on an ordinary weekday not in the holiday set", () => {
    const holidays = new Set(["2026-10-02"]);
    expect(isMarketOpen(new Date("2026-10-01T06:00:00.000Z"), holidays)).toBe(true);
  });
});
