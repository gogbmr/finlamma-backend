// Strict date-range filter parsing for admin-only list pages (Consent,
// Doubt Zone - Task 3b follow-up). Deliberately conservative: any
// malformed, out-of-order, or too-wide range silently falls back to "no
// filter" rather than throwing or letting a bad value reach a query -
// this is a staff-facing quick-filter, not a validated form field with
// its own error UI, so silently ignoring a bad value (as a hand-edited
// or bookmarked URL might produce) is safer than surfacing a 500.
export type DateRangeFilter = { from: Date | null; to: Date | null };

// A fat-finger guard, not a product limit - no legitimate "show me
// requests/flags in this window" query needs more than about a year.
export const MAX_DATE_RANGE_DAYS = 366;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseStrictIsoDate(raw: string | string[] | undefined): Date | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !ISO_DATE_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Reads a plain-date range (?from=&to= by default) from a page's
// searchParams. Both bounds must be present, well-formed, with from <= to
// and the span within MAX_DATE_RANGE_DAYS - any single violation drops
// BOTH bounds back to null (an open-ended one-sided range is refused
// rather than silently allowed through unbounded).
export function readDateRangeFilter(
  searchParams: Record<string, string | string[] | undefined>,
  fromKey = "from",
  toKey = "to",
): DateRangeFilter {
  const from = parseStrictIsoDate(searchParams[fromKey]);
  const to = parseStrictIsoDate(searchParams[toKey]);
  if (!from || !to) return { from: null, to: null };
  if (from.getTime() > to.getTime()) return { from: null, to: null };

  const rangeDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
  if (rangeDays > MAX_DATE_RANGE_DAYS) return { from: null, to: null };

  return { from, to };
}
