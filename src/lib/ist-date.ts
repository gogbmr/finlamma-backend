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
