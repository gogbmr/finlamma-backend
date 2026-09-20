import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { consentRecords, parentContacts, users } from "@/db/schema";

// Guarded by `where isNull(dateOfBirth)` even though the service layer
// already checks this first, so a race between two concurrent requests
// can't both "win" - returns null (not the row) if it was already set.
export async function setDateOfBirthOnce(userId: string, dateOfBirth: string) {
  const [updated] = await db
    .update(users)
    .set({ dateOfBirth })
    .where(and(eq(users.id, userId), isNull(users.dateOfBirth)))
    .returning();
  return updated ?? null;
}

// Used to personalize the consent request/receipt emails and the public
// consent page - never anything more sensitive than the same kid-safe
// first name already shown throughout the app.
export async function getUserFirstName(userId: string): Promise<string | null> {
  const [row] = await db.select({ firstName: users.firstName }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.firstName ?? null;
}

export async function getParentContact(userId: string) {
  const [row] = await db
    .select()
    .from(parentContacts)
    .where(eq(parentContacts.userId, userId))
    .limit(1);
  return row ?? null;
}

// One row per user (unique on user_id - see src/db/schema/compliance.ts),
// updated in place if the parent's details change on a resend.
export async function upsertParentContact(userId: string, name: string, email: string) {
  const existing = await getParentContact(userId);
  if (existing) {
    const [updated] = await db
      .update(parentContacts)
      .set({ name, email })
      .where(eq(parentContacts.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db.insert(parentContacts).values({ userId, name, email }).returning();
  return created;
}

export async function countChildrenForParentEmail(email: string): Promise<number> {
  const rows = await db
    .select({ userId: parentContacts.userId })
    .from(parentContacts)
    .where(eq(parentContacts.email, email));
  return rows.length;
}

export async function getConsentRecord(userId: string) {
  const [row] = await db
    .select()
    .from(consentRecords)
    .where(eq(consentRecords.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function getConsentRecordByTokenHash(tokenHash: string) {
  const [row] = await db
    .select()
    .from(consentRecords)
    .where(eq(consentRecords.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

// Sums request_count across every consent_records row whose parent_contacts
// email matches, for today's UTC date - the per-parent-email half of the
// daily resend cap (the per-user half just reads the caller's own row).
// Volumes here are tiny (a handful of children per email at most), so this
// is a plain filter-in-JS rather than a date-filtered SQL aggregate.
export async function sumRequestsTodayForParentEmail(
  email: string,
  todayUtc: string,
): Promise<number> {
  const rows = await db
    .select({ requestCount: consentRecords.requestCount, requestCountDate: consentRecords.requestCountDate })
    .from(consentRecords)
    .innerJoin(parentContacts, eq(parentContacts.id, consentRecords.parentContactId))
    .where(eq(parentContacts.email, email));
  return rows
    .filter((r) => r.requestCountDate === todayUtc)
    .reduce((sum, r) => sum + r.requestCount, 0);
}

type UpsertConsentRequestInput = {
  userId: string;
  parentContactId: string;
  tokenHash: string;
  tokenExpiresAt: Date;
  requestCount: number;
  requestCountDate: string;
};

// One row per user (unique on user_id): a resend regenerates the token in
// place on the same row rather than creating a duplicate, per
// docs/DATA_MODEL.md.
export async function upsertConsentRequest(input: UpsertConsentRequestInput) {
  const existing = await getConsentRecord(input.userId);
  const now = new Date();
  const values = {
    parentContactId: input.parentContactId,
    status: "pending" as const,
    tokenHash: input.tokenHash,
    tokenExpiresAt: input.tokenExpiresAt,
    usedAt: null,
    lastRequestedAt: now,
    requestCount: input.requestCount,
    requestCountDate: input.requestCountDate,
  };

  if (existing) {
    const [updated] = await db
      .update(consentRecords)
      .set(values)
      .where(eq(consentRecords.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(consentRecords)
    .values({ userId: input.userId, ...values })
    .returning();
  return created;
}

type MarkConsentedInput = {
  legalDocumentVersions: Record<string, number>;
  withdrawTokenHash: string;
  actorIp: string | null;
  actorUserAgent: string | null;
};

// Only flips a row that's still `pending` (the where clause), so a token
// that's already been consumed - by a concurrent request, or because the
// parent already acted - can never be double-processed. Returns null on
// that race, same "caller checks for null" shape as setDateOfBirthOnce.
export async function markConsentConfirmed(consentRecordId: string, input: MarkConsentedInput) {
  const now = new Date();
  const [updated] = await db
    .update(consentRecords)
    .set({
      status: "consented",
      usedAt: now,
      actedAt: now,
      legalDocumentVersions: input.legalDocumentVersions,
      withdrawTokenHash: input.withdrawTokenHash,
      actorIp: input.actorIp,
      actorUserAgent: input.actorUserAgent,
    })
    .where(and(eq(consentRecords.id, consentRecordId), eq(consentRecords.status, "pending")))
    .returning();
  return updated ?? null;
}
