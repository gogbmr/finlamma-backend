import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { AppError } from "./errors";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function created<T>(data: T) {
  return ok(data, 201);
}

export function okList<T>(data: T[], nextCursor: string | null) {
  return NextResponse.json({ data, nextCursor }, { status: 200 });
}

export function fail(error: AppError) {
  return NextResponse.json(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    },
    { status: error.status },
  );
}

type RouteHandler<Args extends unknown[]> = (
  ...args: Args
) => Promise<Response>;

// Wraps a route handler so any thrown AppError/ZodError becomes the standard
// error envelope instead of crashing the request.
export function withErrors<Args extends unknown[]>(
  handler: RouteHandler<Args>,
): RouteHandler<Args> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof AppError) return fail(err);
      if (err instanceof ZodError) {
        return fail(
          new AppError(
            "VALIDATION_FAILED",
            "Request validation failed",
            z.flattenError(err).fieldErrors,
          ),
        );
      }
      console.error(err);
      return fail(new AppError("INTERNAL", "Something went wrong"));
    }
  };
}

// Cursor pagination: an opaque base64url token wrapping the last row's sort key.
// Callers pass whatever shape their query needs (e.g. { id, createdAt }).
export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeCursor<T = unknown>(
  cursor: string | null | undefined,
): T | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as T;
  } catch {
    throw new AppError("VALIDATION_FAILED", "Invalid cursor");
  }
}

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_PAGE_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new AppError("VALIDATION_FAILED", "limit must be a positive integer");
  }
  return Math.min(n, MAX_PAGE_LIMIT);
}
