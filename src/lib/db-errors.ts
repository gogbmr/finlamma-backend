const POSTGRES_UNIQUE_VIOLATION = "23505";

function hasCode(value: unknown, code: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    value.code === code
  );
}

// drizzle-orm wraps the driver's PostgresError in a DrizzleQueryError, so
// the Postgres error code lives on `.cause`, not on the thrown error itself.
export function isUniqueViolation(err: unknown): boolean {
  if (hasCode(err, POSTGRES_UNIQUE_VIOLATION)) return true;
  return (
    typeof err === "object" &&
    err !== null &&
    "cause" in err &&
    hasCode(err.cause, POSTGRES_UNIQUE_VIOLATION)
  );
}
