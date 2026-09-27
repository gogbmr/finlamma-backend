// Pure parser for AMFI's public NAVAll.txt (docs/ARCHITECTURE.md D46) - no
// network access, so this is exhaustively testable against real captured
// sample text. "Parsed defensively" (founder's Checkpoint 8 requirement):
// a fund whose scheme code doesn't appear, or whose NAV/date doesn't parse
// to something valid, is reported as a FAILURE for that fund only - never
// silently skipped, never a partial/garbage NAV written. The caller
// (src/inngest/functions/amfi-nav-ingest.ts) decides what to do with
// failures (log + only ingest the funds that parsed cleanly).
//
// Format notes: real lines look like
// "120716;INF789F01XA0;-;UTI Nifty 50 Index Fund;Direct Plan;Growth;162.9607;25-Sep-2026"
// (current format, 8 columns) or the older 6-column format with no
// separate Plan/Option columns. NAV and Date are always the LAST TWO
// columns in every AMFI format seen so far - reading from the end (not a
// fixed column index) is what makes this resilient to AMFI adding another
// column later without a code change. Header lines, blank lines, AMC-name
// lines ("Axis Mutual Fund") and category-header lines
// ("Open Ended Schemes(...)") all have a non-numeric or missing first
// field - filtered out by the scheme-code-must-be-all-digits check alone,
// no column-count heuristic needed for those.
//
// AMFI Scheme Codes are permanent, stable per (fund, plan, option)
// identifiers - the Direct/Growth choice is already baked into WHICH code
// we seeded per fund (scripts/seed-funds.ts), so this parser doesn't need
// to filter by Plan/Option text at all, only look up the exact code.

const MONTH_ABBREVIATIONS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

// "25-Sep-2026" -> "2026-09-25". Returns null (never throws) for anything
// that doesn't match - the caller treats that as a parse failure.
export function parseAmfiDate(raw: string): string | null {
  const parts = raw.trim().split("-");
  if (parts.length !== 3) return null;
  const [dayStr, monStr, yearStr] = parts as [string, string, string];
  if (!/^\d{1,2}$/.test(dayStr) || !/^\d{4}$/.test(yearStr)) return null;
  const month = MONTH_ABBREVIATIONS[monStr.toLowerCase().slice(0, 3)];
  if (!month) return null;
  const day = Number(dayStr);
  if (day < 1 || day > 31) return null;
  return `${yearStr}-${month}-${dayStr.padStart(2, "0")}`;
}

export type AmfiTarget = { fundId: string; amfiSchemeCode: string };
export type AmfiIngestSuccess = { fundId: string; navPaise: number; date: string };
export type AmfiIngestFailureReason = "not_found" | "unparseable_nav" | "unparseable_date";
export type AmfiIngestFailure = { fundId: string; amfiSchemeCode: string; reason: AmfiIngestFailureReason };

export function parseAmfiNavAll(
  rawText: string,
  targets: AmfiTarget[],
): { successes: AmfiIngestSuccess[]; failures: AmfiIngestFailure[] } {
  const bySchemeCode = new Map<string, { navRaw: string; dateRaw: string }>();

  for (const line of rawText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(";");
    if (parts.length < 6) continue;
    const schemeCode = parts[0]!.trim();
    if (!/^\d+$/.test(schemeCode)) continue; // header / AMC-name / category-header line
    const navRaw = parts[parts.length - 2]!.trim();
    const dateRaw = parts[parts.length - 1]!.trim();
    bySchemeCode.set(schemeCode, { navRaw, dateRaw });
  }

  const successes: AmfiIngestSuccess[] = [];
  const failures: AmfiIngestFailure[] = [];

  for (const target of targets) {
    const row = bySchemeCode.get(target.amfiSchemeCode);
    if (!row) {
      failures.push({ fundId: target.fundId, amfiSchemeCode: target.amfiSchemeCode, reason: "not_found" });
      continue;
    }

    const navRupees = Number(row.navRaw);
    if (!Number.isFinite(navRupees) || navRupees <= 0) {
      failures.push({ fundId: target.fundId, amfiSchemeCode: target.amfiSchemeCode, reason: "unparseable_nav" });
      continue;
    }

    const date = parseAmfiDate(row.dateRaw);
    if (!date) {
      failures.push({ fundId: target.fundId, amfiSchemeCode: target.amfiSchemeCode, reason: "unparseable_date" });
      continue;
    }

    // CLAUDE.md rule 2: money/prices are integer paise, no exception for
    // NAV - rounding AMFI's 4-decimal-place rupee figure to the nearest
    // paise is what D45 documents as the source of fund round-trips being
    // "exact when amounts divide evenly, sub-paise-bounded otherwise"
    // (unlike a stock round trip, which is always exact).
    successes.push({ fundId: target.fundId, navPaise: Math.round(navRupees * 100), date });
  }

  return { successes, failures };
}
