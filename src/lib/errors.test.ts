import { describe, expect, it } from "vitest";
import { AppError } from "./errors";

describe("AppError", () => {
  it("maps codes to the right HTTP status", () => {
    expect(new AppError("NOT_FOUND", "missing").status).toBe(404);
    expect(new AppError("VALIDATION_FAILED", "bad input").status).toBe(400);
    expect(new AppError("CONFLICT", "dup").status).toBe(409);
    expect(new AppError("IDEMPOTENCY_REPLAY", "dup key").status).toBe(409);
    expect(new AppError("SERVICE_UNAVAILABLE", "down").status).toBe(503);
  });

  it("carries the message and optional details", () => {
    const err = new AppError("VALIDATION_FAILED", "bad input", {
      field: ["required"],
    });
    expect(err.message).toBe("bad input");
    expect(err.details).toEqual({ field: ["required"] });
    expect(err).toBeInstanceOf(Error);
  });
});
