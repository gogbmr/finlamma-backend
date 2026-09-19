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

// drizzle-orm/postgres-js query errors format their `.message` as
// "Failed query: <sql>\nparams: <the actual interpolated values>" - the SQL
// text itself is safe (schema names and placeholders only), but the params
// line can contain literal user data (a real email, phone, name, ...), so
// it's stripped out wherever it appears, including inside a full `.stack`
// string (which starts with the same message).
function scrubDriverParamsLine(text: string): string {
  return text.replace(/\nparams:[^\n]*/i, "");
}

// A driver error's `.cause` (e.g. postgres-js's PostgresError, or its
// connection-level errors like CONNECTION_CLOSED) can carry the real
// SQLSTATE code and schema metadata that's exactly what's needed to
// diagnose a production failure. Only ever surface these specific,
// non-user-data fields though - never `message`/`detail`/`hint`, which
// Postgres fills with the literal offending value for constraint
// violations (e.g. "Key (email)=(user@example.com) already exists.") -
// same reasoning as the raw-driver-error scrub in src/server/users/repo.ts.
const SAFE_CAUSE_FIELDS = [
  "code",
  "severity",
  "schema_name",
  "table_name",
  "column_name",
  "constraint_name",
  "routine",
  "errno",
  "address",
  "port",
] as const;

function safeCauseFields(cause: unknown): Record<string, unknown> | undefined {
  if (typeof cause !== "object" || cause === null) return undefined;
  const safe: Record<string, unknown> = {};
  for (const key of SAFE_CAUSE_FIELDS) {
    if (key in cause) safe[key] = (cause as Record<string, unknown>)[key];
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}

// Logs an unexpected (non-AppError, non-ZodError) thrown value tagged with
// errorId so it can be found in the server logs from the errorId alone -
// e.g. handed back from a webhook provider's failed-delivery dashboard,
// with no other way to correlate it to a specific log line. Scrubbed: an
// arbitrary thrown value (not necessarily an Error) could be anything, so
// we only ever log a plain string built from fields we control the shape
// of, never the raw value/message itself.
function logInternalError(errorId: string, err: unknown): void {
  if (err instanceof Error) {
    const stack = scrubDriverParamsLine(err.stack ?? `${err.name}: ${err.message}`);
    const cause = "cause" in err ? safeCauseFields(err.cause) : undefined;
    console.error(
      `[${errorId}] ${stack}` +
        (cause ? `\n[${errorId}] cause: ${JSON.stringify(cause)}` : ""),
    );
  } else {
    console.error(`[${errorId}] Non-Error value thrown (${typeof err})`);
  }
}

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
      const errorId = crypto.randomUUID();
      logInternalError(errorId, err);
      return fail(
        new AppError("INTERNAL", "Something went wrong", { errorId }),
      );
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
