import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";

export type UserPrefsUpdate = {
  language?: "en" | "hi" | "hx";
  theme?: "dark" | "light";
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
// harmless no-op restricted by the deletedAt IS NULL guard.
export async function anonymizeUserFromClerk(clerkUserId: string) {
  await db
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
    })
    .where(and(eq(users.clerkUserId, clerkUserId), isNull(users.deletedAt)));
}
