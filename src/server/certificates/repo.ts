import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { certificates } from "@/db/schema";

export type InsertCertificateInput = {
  userId: string;
  worldId: string;
  code: string;
  xpEarned: number;
  accuracyPct: number;
};

// Idempotent on (userId, worldId) - a retried/duplicate boss-quiz-pass
// submit never issues a second certificate for the same world (same
// "insert, treat a conflict as already-done" pattern as xp_events/
// vmoney_ledger, D26). A conflict on the OTHER unique constraint (`code`,
// e.g. two learners finishing the same world in the same counting window)
// is NOT swallowed by this onConflictDoNothing target - it propagates so
// the caller can retry with the next sequence number instead of silently
// losing a certificate. Returns null only for the (userId, worldId)
// already-issued case.
export async function insertCertificateIfAbsent(input: InsertCertificateInput) {
  const [row] = await db
    .insert(certificates)
    .values(input)
    .onConflictDoNothing({ target: [certificates.userId, certificates.worldId] })
    .returning();
  return row ?? null;
}

// Feeds the next sequential number for a world+year (FL-<code>-<year>-<seq>) -
// counts existing certificates for this world issued since the start of the
// given IST calendar year. Not perfectly race-proof under heavy concurrent
// completions of the same world in the same year (two callers could compute
// the same count and then race on the `code` unique constraint) - the
// service layer's insert-and-retry-on-code-collision loop is what actually
// closes that gap; this is just the starting guess.
export async function countCertificatesForWorldSinceYearStart(
  worldId: string,
  yearStartUtc: Date,
): Promise<number> {
  const rows = await db
    .select({ id: certificates.id })
    .from(certificates)
    .where(and(eq(certificates.worldId, worldId), gte(certificates.createdAt, yearStartUtc)));
  return rows.length;
}

export async function getCertificate(userId: string, worldId: string) {
  const [row] = await db
    .select()
    .from(certificates)
    .where(and(eq(certificates.userId, userId), eq(certificates.worldId, worldId)))
    .limit(1);
  return row ?? null;
}

export async function listCertificatesForUser(userId: string) {
  return db
    .select()
    .from(certificates)
    .where(eq(certificates.userId, userId))
    .orderBy(desc(certificates.createdAt));
}

// Set once, lazily, the first time GET .../pdf is called for a certificate -
// see src/server/certificates/service.ts. The `fileKey IS NULL` guard means
// this only ever moves fileKey from null to a real key, never overwrites an
// already-rendered one - a concurrent duplicate request just gets an empty
// `.returning()`, and the service layer re-reads the row either way.
export async function setCertificateFileKey(id: string, fileKey: string) {
  const [row] = await db
    .update(certificates)
    .set({ fileKey })
    .where(and(eq(certificates.id, id), isNull(certificates.fileKey)))
    .returning();
  return row ?? null;
}
