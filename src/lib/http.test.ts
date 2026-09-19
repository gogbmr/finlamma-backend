import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError } from "./errors";
import {
  created,
  decodeCursor,
  encodeCursor,
  fail,
  ok,
  okList,
  parseLimit,
  withErrors,
} from "./http";

describe("ok/created/okList", () => {
  it("wraps data in the { data } envelope", async () => {
    const res = ok({ id: "1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { id: "1" } });
  });

  it("created() returns 201", () => {
    expect(created({ id: "1" }).status).toBe(201);
  });

  it("okList() includes nextCursor", async () => {
    const res = okList([{ id: "1" }], "abc");
    expect(await res.json()).toEqual({
      data: [{ id: "1" }],
      nextCursor: "abc",
    });
  });
});

describe("fail", () => {
  it("wraps an AppError in the { error } envelope with its status", async () => {
    const res = fail(new AppError("NOT_FOUND", "missing"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "NOT_FOUND", message: "missing" },
    });
  });

  it("includes details when present", async () => {
    const res = fail(
      new AppError("VALIDATION_FAILED", "bad", { field: ["required"] }),
    );
    expect(await res.json()).toEqual({
      error: {
        code: "VALIDATION_FAILED",
        message: "bad",
        details: { field: ["required"] },
      },
    });
  });
});

describe("withErrors", () => {
  it("passes through a successful response", async () => {
    const handler = withErrors(async () => ok({ ok: true }));
    const res = await handler();
    expect(res.status).toBe(200);
  });

  it("converts a thrown AppError to its envelope", async () => {
    const handler = withErrors(async () => {
      throw new AppError("FORBIDDEN", "nope");
    });
    const res = await handler();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: { code: "FORBIDDEN", message: "nope" },
    });
  });

  it("converts a thrown ZodError to VALIDATION_FAILED", async () => {
    const schema = z.object({ name: z.string() });
    const handler = withErrors(async () => {
      schema.parse({});
      return ok({});
    });
    const res = await handler();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("converts an unknown thrown error to INTERNAL", async () => {
    const handler = withErrors(async () => {
      throw new Error("boom");
    });
    const res = await handler();
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("INTERNAL");
  });

  it("tags an unexpected error with a findable errorId in both the response and the log", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withErrors(async () => {
      throw new Error("boom");
    });

    const res = await handler();
    const body = await res.json();

    expect(body.error.details.errorId).toEqual(expect.any(String));
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(body.error.details.errorId),
    );
    consoleError.mockRestore();
  });

  it("never logs a non-Error thrown value raw (scrubbed)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const secretLookingPayload = { apiKey: "sk_should_never_be_logged" };
    const handler = withErrors(async () => {
      throw secretLookingPayload;
    });

    await handler();

    for (const call of consoleError.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("sk_should_never_be_logged");
    }
    consoleError.mockRestore();
  });
});

describe("cursor pagination", () => {
  it("round-trips a cursor value", () => {
    const cursor = encodeCursor({
      id: "42",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(decodeCursor(cursor)).toEqual({
      id: "42",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("returns null for an absent cursor", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
  });

  it("throws VALIDATION_FAILED for a garbage cursor", () => {
    expect(() => decodeCursor("not-base64-json")).toThrow(AppError);
  });

  it("parseLimit defaults, clamps and rejects invalid input", () => {
    expect(parseLimit(null)).toBe(20);
    expect(parseLimit("50")).toBe(50);
    expect(parseLimit("500")).toBe(100);
    expect(() => parseLimit("0")).toThrow(AppError);
    expect(() => parseLimit("abc")).toThrow(AppError);
  });
});
