import { describe, expect, it } from "vitest";
import { parseAmfiDate, parseAmfiNavAll } from "./amfi-parser";

// Real captured shape of AMFI's NAVAll.txt (docs/ARCHITECTURE.md D46) -
// header, blank lines, a category-header line, an AMC-name line (no
// semicolons), then real data rows. Deliberately includes rows for scheme
// codes we do NOT track, to prove the parser only reports on the targets
// it's asked about, not every row in the file.
const SAMPLE_NAVALL = `Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date

Open Ended Schemes(Growth)

Axis Mutual Fund

135762;INF846K01WO1;-;Axis Children's Fund;Direct Plan;Growth Option;29.6905;25-Sep-2026
135759;INF846K01WJ1;-;Axis Children's Fund;Regular Plan;Growth Option;25.8499;25-Sep-2026

UTI Mutual Fund

120716;INF789F01XA0;-;UTI Nifty 50 Index Fund;Direct Plan;Growth;162.9607;25-Sep-2026
120000;INF789F01YY0;-;UTI Some Other Fund;Direct Plan;Growth;10.0000;25-Sep-2026
`;

describe("parseAmfiDate", () => {
  it("parses a real AMFI date into ISO form", () => {
    expect(parseAmfiDate("25-Sep-2026")).toBe("2026-09-25");
  });

  it("is case-insensitive on the month abbreviation", () => {
    expect(parseAmfiDate("01-JAN-2027")).toBe("2027-01-01");
    expect(parseAmfiDate("01-jan-2027")).toBe("2027-01-01");
  });

  it("returns null for a malformed date, never throws", () => {
    expect(parseAmfiDate("not-a-date")).toBeNull();
    expect(parseAmfiDate("25-Foo-2026")).toBeNull();
    expect(parseAmfiDate("25-Sep-26")).toBeNull();
    expect(parseAmfiDate("")).toBeNull();
  });
});

describe("parseAmfiNavAll", () => {
  it("finds a tracked scheme code's NAV and date, rounded to the nearest paise", () => {
    const { successes, failures } = parseAmfiNavAll(SAMPLE_NAVALL, [
      { fundId: "fund-1", amfiSchemeCode: "120716" },
    ]);

    expect(failures).toEqual([]);
    expect(successes).toEqual([{ fundId: "fund-1", navPaise: 16296, date: "2026-09-25" }]);
  });

  it("reports not_found for a scheme code that isn't in the file at all", () => {
    const { successes, failures } = parseAmfiNavAll(SAMPLE_NAVALL, [
      { fundId: "fund-missing", amfiSchemeCode: "999999" },
    ]);

    expect(successes).toEqual([]);
    expect(failures).toEqual([{ fundId: "fund-missing", amfiSchemeCode: "999999", reason: "not_found" }]);
  });

  it("reports unparseable_nav for a non-numeric or non-positive NAV", () => {
    const badNav = `120716;INF1;-;Test Fund;Direct Plan;Growth;N/A;25-Sep-2026\n`;
    expect(parseAmfiNavAll(badNav, [{ fundId: "f1", amfiSchemeCode: "120716" }]).failures).toEqual([
      { fundId: "f1", amfiSchemeCode: "120716", reason: "unparseable_nav" },
    ]);

    const zeroNav = `120716;INF1;-;Test Fund;Direct Plan;Growth;0;25-Sep-2026\n`;
    expect(parseAmfiNavAll(zeroNav, [{ fundId: "f1", amfiSchemeCode: "120716" }]).failures).toEqual([
      { fundId: "f1", amfiSchemeCode: "120716", reason: "unparseable_nav" },
    ]);
  });

  it("reports unparseable_date for a malformed date", () => {
    const badDate = `120716;INF1;-;Test Fund;Direct Plan;Growth;100.00;not-a-date\n`;
    expect(parseAmfiNavAll(badDate, [{ fundId: "f1", amfiSchemeCode: "120716" }]).failures).toEqual([
      { fundId: "f1", amfiSchemeCode: "120716", reason: "unparseable_date" },
    ]);
  });

  it("never reports on a scheme code it wasn't asked about", () => {
    const { successes, failures } = parseAmfiNavAll(SAMPLE_NAVALL, []);
    expect(successes).toEqual([]);
    expect(failures).toEqual([]);
  });

  it("handles the older 6-column format (no separate Plan/Option columns) via the last-two-columns rule", () => {
    const oldFormat = `120716;INF789F01XA0;-;UTI Nifty 50 Index Fund - Direct Plan - Growth;162.9607;25-Sep-2026\n`;
    const { successes } = parseAmfiNavAll(oldFormat, [{ fundId: "fund-1", amfiSchemeCode: "120716" }]);
    expect(successes).toEqual([{ fundId: "fund-1", navPaise: 16296, date: "2026-09-25" }]);
  });

  it("ignores header, blank, category-header and AMC-name lines without treating them as data rows", () => {
    const { successes, failures } = parseAmfiNavAll(SAMPLE_NAVALL, [
      { fundId: "fund-1", amfiSchemeCode: "120716" },
      { fundId: "fund-2", amfiSchemeCode: "135762" },
    ]);
    expect(successes).toHaveLength(2);
    expect(failures).toEqual([]);
  });
});
