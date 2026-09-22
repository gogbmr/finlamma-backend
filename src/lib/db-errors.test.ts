import { describe, expect, it } from "vitest";
import { isTransactionConflict, isUniqueViolation } from "./db-errors";

describe("isUniqueViolation", () => {
  it("recognizes a raw code on the error", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("recognizes a code nested under .cause (drizzle's DrizzleQueryError wrapping)", () => {
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
  });

  it("returns false for an unrelated code", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
  });

  it("returns false for non-object/null values", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("boom")).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
  });
});

describe("isTransactionConflict", () => {
  it("recognizes a serialization failure (40001), raw and nested under .cause", () => {
    expect(isTransactionConflict({ code: "40001" })).toBe(true);
    expect(isTransactionConflict({ cause: { code: "40001" } })).toBe(true);
  });

  it("recognizes a deadlock (40P01), raw and nested under .cause", () => {
    expect(isTransactionConflict({ code: "40P01" })).toBe(true);
    expect(isTransactionConflict({ cause: { code: "40P01" } })).toBe(true);
  });

  it("returns false for a unique violation - a different kind of conflict", () => {
    expect(isTransactionConflict({ code: "23505" })).toBe(false);
  });

  it("returns false for non-object/null values", () => {
    expect(isTransactionConflict(null)).toBe(false);
    expect(isTransactionConflict(undefined)).toBe(false);
  });
});
