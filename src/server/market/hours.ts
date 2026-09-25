import { istDayOfWeek, istMinutesSinceMidnight, istDateString } from "@/lib/ist-date";

// trading-rules skill: "Open 09:15-15:30 Mon-Fri, excluding market_holidays."
// A permanent constant, same reasoning as ist-date.ts's fixed IST offset -
// NSE's regular session hours don't change day to day.
const MARKET_OPEN_MINUTES = 9 * 60 + 15;
const MARKET_CLOSE_MINUTES = 15 * 60 + 30;

// Pure function - never reaches the database itself, so it's trivially
// testable and reusable from both the market-status endpoint and
// Checkpoint 5's order-placement MARKET_CLOSED check. `holidayDates` is the
// caller's job to fetch (market_holidays, admin-editable) - keeping this
// function pure means it never needs to know how that lookup happens.
export function isMarketOpen(now: Date, holidayDates: ReadonlySet<string>): boolean {
  const dayOfWeek = istDayOfWeek(now);
  if (dayOfWeek === 0 || dayOfWeek === 6) return false; // Sun/Sat
  if (holidayDates.has(istDateString(now))) return false;

  const minutes = istMinutesSinceMidnight(now);
  return minutes >= MARKET_OPEN_MINUTES && minutes < MARKET_CLOSE_MINUTES;
}
