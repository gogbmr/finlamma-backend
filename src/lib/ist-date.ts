// India Standard Time is a fixed UTC+5:30 offset year-round - India has
// never observed daylight saving time, so this is a permanent constant,
// not something that needs a timezone database (Intl.DateTimeFormat with
// timeZone: "Asia/Kolkata" would give the identical answer, at real
// runtime cost for zero behavioral difference). CLAUDE.md rule 7: "compute
// streak days and market hours in Asia/Kolkata" - this is that
// computation. Every caller passes the server's own clock (`new Date()`)
// or a value derived from it - never anything client-supplied (see
// docs/ARCHITECTURE.md D30).
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// The IST calendar date (YYYY-MM-DD) a given instant falls on. Shifting the
// UTC instant by the IST offset and then reading its UTC calendar fields
// back out is what makes this correct at the day boundary - e.g. 2026-01-01
// 19:00 UTC is 2026-01-02 00:30 IST, a different calendar day.
export function istDateString(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// The IST calendar month (YYYY-MM) an instant falls on - used for the
// streak freeze allowance's monthly reset (docs/ARCHITECTURE.md D30).
export function istYearMonth(date: Date = new Date()): string {
  return istDateString(date).slice(0, 7);
}

// The current IST calendar year, as a number - e.g. 2026.
export function istYear(date: Date = new Date()): number {
  return Number(istDateString(date).slice(0, 4));
}

// The UTC instant of IST midnight for the IST calendar day `date` falls in -
// e.g. src/server/daily-goals/service.ts needs a UTC boundary to compare
// stored UTC timestamps against ("did this happen today, IST") for a raw
// count, not a string.
export function istDateStartUtc(date: Date = new Date()): Date {
  return new Date(Date.parse(`${istDateString(date)}T00:00:00Z`) - IST_OFFSET_MS);
}

// The IST calendar date (YYYY-MM-DD) of the Monday starting the IST week
// `date` falls in - src/server/report-card's weekly snapshot key
// (PRODUCT_SPEC.md §6: "written by a weekly Inngest job, Monday IST").
export function istWeekStartDate(date: Date = new Date()): string {
  const dateStr = istDateString(date);
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const diffFromMonday = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - diffFromMonday);
  return d.toISOString().slice(0, 10);
}

// The UTC instant of IST midnight, the Monday starting the IST week `date`
// falls in - the lower bound for "this week"'s queries.
export function istWeekStartUtc(date: Date = new Date()): Date {
  const weekStart = istWeekStartDate(date);
  return new Date(Date.parse(`${weekStart}T00:00:00Z`) - IST_OFFSET_MS);
}

// The UTC instant of IST midnight, the 1st of the IST calendar month `date`
// falls in - e.g. src/server/economy/service.ts's getMyWallet needs a UTC
// boundary for "earned this (IST) month".
export function istMonthStartUtc(date: Date = new Date()): Date {
  const [year, month] = istYearMonth(date).split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, 1) - IST_OFFSET_MS);
}

// The UTC instant of IST midnight, January 1st of the given year - e.g. a
// "how many certificates were issued this IST year" count
// (src/server/certificates/repo.ts) needs a UTC boundary to compare stored
// UTC timestamps against, not a string.
export function istYearStartUtc(year: number): Date {
  return new Date(Date.UTC(year, 0, 1) - IST_OFFSET_MS);
}

// Whole calendar days between two IST date strings (b - a). Both are
// parsed as UTC midnight purely as a stable anchor for subtraction - the
// values themselves are already IST calendar dates (from istDateString),
// not being re-interpreted in any timezone.
export function daysBetweenIstDates(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round((db - da) / msPerDay);
}
