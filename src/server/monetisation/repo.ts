import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { entitlements, users, webhookEvents } from "@/db/schema";
import type { EntitlementKey } from "./schemas";

// RevenueCat makes no ordering or single-delivery guarantee, and retries
// reuse the same event id - this IS the entire replay guard (there's no
// clerkUpdatedAt-style staleness field on `entitlements` to additionally
// lean on, unlike the Clerk webhook). Returns false if this exact
// (source, eventId) was already recorded.
export async function recordWebhookEventIfNew(
  source: "revenuecat",
  eventId: string,
): Promise<boolean> {
  const [row] = await db
    .insert(webhookEvents)
    .values({ source, eventId })
    .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.eventId] })
    .returning();
  return row !== undefined;
}

export async function findUserById(userId: string) {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row ?? null;
}

// Current-state upsert, keyed on (userId, entitlement) - never a history
// row, same reasoning as parentContacts/consentRecords elsewhere in this
// codebase.
export async function upsertEntitlement(input: {
  userId: string;
  entitlement: EntitlementKey;
  source: "revenuecat" | "razorpay";
  expiresAt: Date | null;
  raw: Record<string, unknown>;
}): Promise<void> {
  await db
    .insert(entitlements)
    .values(input)
    .onConflictDoUpdate({
      target: [entitlements.userId, entitlements.entitlement],
      set: { source: input.source, expiresAt: input.expiresAt, raw: input.raw },
    });
}

export async function getEntitlementsForUser(userId: string) {
  return db.select().from(entitlements).where(eq(entitlements.userId, userId));
}
