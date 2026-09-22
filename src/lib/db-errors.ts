const POSTGRES_UNIQUE_VIOLATION = "23505";
const POSTGRES_FOREIGN_KEY_VIOLATION = "23503";
const POSTGRES_SERIALIZATION_FAILURE = "40001";
const POSTGRES_DEADLOCK_DETECTED = "40P01";

function hasCode(value: unknown, code: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    value.code === code
  );
}

function hasAnyCode(err: unknown, codes: readonly string[]): boolean {
  if (codes.some((code) => hasCode(err, code))) return true;
  return (
    typeof err === "object" &&
    err !== null &&
    "cause" in err &&
    codes.some((code) => hasCode(err.cause, code))
  );
}

// drizzle-orm wraps the driver's PostgresError in a DrizzleQueryError, so
// the Postgres error code lives on `.cause`, not on the thrown error itself.
export function isUniqueViolation(err: unknown): boolean {
  return hasAnyCode(err, [POSTGRES_UNIQUE_VIOLATION]);
}

// A row was deleted (or otherwise changed) while something else still
// referenced it via an `onDelete: "restrict"` FK - e.g.
// src/server/worlds/service.ts's deleteWorld checks a world has zero
// lessons before deleting it, but that check and the delete itself aren't
// in the same transaction, so a lesson created in between makes the delete
// itself fail this way instead of the earlier count check catching it.
// Callers should map this to a clean CONFLICT telling the user to retry,
// not let it surface as a raw 500.
export function isForeignKeyViolation(err: unknown): boolean {
  return hasAnyCode(err, [POSTGRES_FOREIGN_KEY_VIOLATION]);
}

// A multi-statement transaction (e.g. src/server/worlds/repo.ts's
// moveWorldToPosition, which touches several rows across two phases) can
// lose a real concurrent race against another transaction touching the same
// rows - Postgres detects this itself as either a serialization failure or
// a deadlock and aborts one of the two transactions automatically,
// rolling back everything it had written (so a transaction that loses this
// race can never leave a partial/sentinel value behind - the abort is what
// keeps that guarantee, not application code). This is expected, retryable
// contention, not a bug - callers should map it to a clean CONFLICT telling
// the user to retry, not let it surface as a raw 500.
export function isTransactionConflict(err: unknown): boolean {
  return hasAnyCode(err, [POSTGRES_SERIALIZATION_FAILURE, POSTGRES_DEADLOCK_DETECTED]);
}
