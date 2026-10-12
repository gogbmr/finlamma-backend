import { and, count, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { users, type UserPreferences } from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";

export type UserPrefsUpdate = {
  language?: "en" | "hi" | "hx";
  theme?: "dark" | "light";
  bio?: string | null;
  state?: string | null;
  preferences?: UserPreferences;
};

// UpdateMeRequestSchema (src/server/users/schemas.ts) already guarantees at
// least one field is present, so `set` is never empty here.
export async function updateUserPrefs(userId: string, input: UserPrefsUpdate) {
  const [updated] = await db
    .update(users)
    .set(input)
    .where(eq(users.id, userId))
    .returning();
  return updated;
}

export type ClerkUserSync = {
  clerkUserId: string;
  firstName: string | null;
  lastInitial: string | null;
  email: string | null;
  phone: string | null;
  clerkUpdatedAt: Date;
};

// Upsert driven by Clerk's user.created/user.updated. The setWhere clause
// makes this safe against Clerk's at-least-once webhook delivery: a
// redelivered or out-of-order event (older clerkUpdatedAt than what we
// already have) is silently ignored rather than overwriting newer data,
// and a soft-deleted row is never touched (deletedAt IS NULL guard) so a
// late user.updated can't resurrect personal data after a user.deleted.
export async function upsertUserFromClerk(input: ClerkUserSync) {
  const excludedClerkUpdatedAt = sql.raw(
    `excluded.${users.clerkUpdatedAt.name}`,
  );

  try {
    await db
      .insert(users)
      .values(input)
      .onConflictDoUpdate({
        target: users.clerkUserId,
        set: {
          firstName: input.firstName,
          lastInitial: input.lastInitial,
          email: input.email,
          phone: input.phone,
          clerkUpdatedAt: input.clerkUpdatedAt,
        },
        setWhere: sql`${users.deletedAt} is null and ${users.clerkUpdatedAt} < ${excludedClerkUpdatedAt}`,
      });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Never let the raw driver error reach a generic console.error/Sentry
      // call - its message embeds the conflicting email/phone verbatim.
      throw new AppError(
        "CONFLICT",
        "Clerk sent an email or phone already in use by another account",
        { clerkUserId: input.clerkUserId },
      );
    }
    throw err;
  }
}

// Driven by Clerk's user.deleted. Unconditional and idempotent: it always
// wins over any concurrent update (no clerkUpdatedAt comparison - deletion
// in Clerk is terminal), and re-applying it to an already-deleted row is a
// harmless no-op restricted by the deletedAt IS NULL guard. Returns the
// anonymized row (or null on that no-op) so callers - both deleteMe() and
// the user.deleted webhook handler - know whether to also run
// scrubConsentDataForDeletedUser (src/server/onboarding/service.ts), which
// needs the internal user id, not just the Clerk id.
export async function getUserById(id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

// Used by syncUserFromClerkEvent's user.deleted branch to resolve Clerk's
// id to our own internal id before handing off to the shared
// reconcileAccountDeletion - every other lookup in this codebase already
// keys off the internal id, this is the one place that still only has the
// Clerk id to start from.
export async function getUserByClerkUserId(clerkUserId: string) {
  const [row] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  return row ?? null;
}

// The durable "deletion was requested" marker - set unconditionally (not
// guarded by a WHERE on the current value) since re-requesting deletion for
// an account that's already mid-deletion is a harmless timestamp refresh,
// never a conflict.
export async function markDeletionRequested(userId: string) {
  const [row] = await db
    .update(users)
    .set({ deletionRequestedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return row ?? null;
}

// The account-deletion reconciliation sweep's worklist (src/server/users/
// service.ts reconcileAccountDeletion, run both from an Inngest event at
// deletion time and from the daily safety-net cron): every account whose
// deletion was requested but hasn't actually finished yet, regardless of
// which step failed.
export async function listStuckAccountDeletions() {
  return db
    .select({ id: users.id, clerkUserId: users.clerkUserId, deletionRequestedAt: users.deletionRequestedAt })
    .from(users)
    .where(and(isNotNull(users.deletionRequestedAt), isNull(users.deletedAt)));
}

// Staff-visible counts (the admin Analytics dashboard) - a "stuck" deletion
// is a real finding worth surfacing now, before Sentry alerting exists, not
// just a greppable log line nobody is watching yet.
export async function countStuckAccountDeletionsOlderThan(cutoff: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(
      and(
        isNotNull(users.deletionRequestedAt),
        isNull(users.deletedAt),
        lte(users.deletionRequestedAt, cutoff),
      ),
    );
  return row?.n ?? 0;
}

export async function anonymizeUserFromClerk(clerkUserId: string) {
  const [updated] = await db
    .update(users)
    .set({
      deletedAt: new Date(),
      email: null,
      phone: null,
      // Deliberately a placeholder, not null: firstName is what any future
      // UI renders as the display name, and "Deleted user" reads better
      // there than a blank. It carries no personal data.
      firstName: "Deleted user",
      lastInitial: null,
      // A minor's real birthdate is personal data too - cleared same as
      // everything else here (see docs/STATUS.md's Phase 2a audit).
      dateOfBirth: null,
      // Free-text, self-editable (up to 280 chars) - a security audit found
      // this was left un-scrubbed, and unlike the other fields here it could
      // contain anything the learner chose to type (a real name, school,
      // address, social handle, ...), so it's cleared on deletion the same
      // as everything else.
      bio: null,
      // Location data - cleared for the same reason as dateOfBirth above.
      state: null,
    })
    .where(and(eq(users.clerkUserId, clerkUserId), isNull(users.deletedAt)))
    .returning();
  return updated ?? null;
}
