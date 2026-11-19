import { describe, expect, it } from "vitest";
import { diffChangedFields, formatChangedValue } from "./confirm-changes-dialog";

describe("diffChangedFields", () => {
  it("keeps only fields whose value actually changed", () => {
    const result = diffChangedFields([
      { label: "Name", oldValue: "Baby", newValue: "Baby" },
      { label: "Order", oldValue: 1, newValue: 2 },
      { label: "Active", oldValue: true, newValue: true },
      { label: "Icon key", oldValue: null, newValue: "new-key" },
    ]);

    expect(result.map((f) => f.label)).toEqual(["Order", "Icon key"]);
  });

  it("returns an empty array when nothing changed", () => {
    const result = diffChangedFields([
      { label: "Name", oldValue: "Baby", newValue: "Baby" },
      { label: "Order", oldValue: 1, newValue: 1 },
    ]);
    expect(result).toEqual([]);
  });

  it("defaults kind to 'text' when omitted", () => {
    const result = diffChangedFields([{ label: "Name", oldValue: "a", newValue: "b" }]);
    expect(result[0]!.kind).toBe("text");
  });

  it("preserves an explicit 'vmoney' kind through the diff", () => {
    const result = diffChangedFields([{ label: "V Money reward", oldValue: 100, newValue: 200, kind: "vmoney" }]);
    expect(result[0]!.kind).toBe("vmoney");
  });
});

describe("formatChangedValue", () => {
  it("formats a vmoney number as rupees with en-IN grouping, labelled 'V Money'", () => {
    // en-IN groups by lakh/crore, not thousands - 150000 -> "1,50,000", not "150,000".
    expect(formatChangedValue(150000, "vmoney")).toBe("₹1,50,000 V Money");
    expect(formatChangedValue(5000, "vmoney")).toBe("₹5,000 V Money");
    expect(formatChangedValue(0, "vmoney")).toBe("₹0 V Money");
  });

  it("never does unit conversion - the number passed in is rendered as-is", () => {
    // The caller is responsible for already having converted (e.g. paise ->
    // rupees before calling in); this function must never divide/multiply.
    expect(formatChangedValue(100, "vmoney")).toBe("₹100 V Money");
  });

  it("formats a plain (non-vmoney) number with no currency symbol or label", () => {
    expect(formatChangedValue(100, "text")).toBe("100");
  });

  it("formats a pre-formatted non-V-Money currency string as plain text (no 'V Money' label added)", () => {
    // Competitions' virtualCapitalPaise is explicitly NOT V Money (D57) -
    // the caller passes an already-formatted "₹1,00,000" string with
    // kind "text", and this must pass it through untouched, never
    // appending "V Money".
    expect(formatChangedValue("₹1,00,000", "text")).toBe("₹1,00,000");
  });

  it("formats booleans as Yes/No", () => {
    expect(formatChangedValue(true, "text")).toBe("Yes");
    expect(formatChangedValue(false, "text")).toBe("No");
  });

  it("formats null and empty string as (empty)", () => {
    expect(formatChangedValue(null, "text")).toBe("(empty)");
    expect(formatChangedValue("", "text")).toBe("(empty)");
  });

  it("formats a plain string as-is", () => {
    expect(formatChangedValue("learning", "text")).toBe("learning");
  });
});
