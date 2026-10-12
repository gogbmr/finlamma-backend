import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { peerHandles, users } from "@/db/schema";
import type { LocalizedText } from "@/db/schema/_helpers";

export async function listPeerHandles() {
  return db.select().from(peerHandles).orderBy(peerHandles.createdAt);
}

export async function listActivePeerHandles() {
  return db.select().from(peerHandles).where(eq(peerHandles.active, true)).orderBy(peerHandles.createdAt);
}

export async function getPeerHandleById(id: string) {
  const [row] = await db.select().from(peerHandles).where(eq(peerHandles.id, id)).limit(1);
  return row ?? null;
}

export async function getPeerHandleByKey(key: string) {
  const [row] = await db.select().from(peerHandles).where(eq(peerHandles.key, key)).limit(1);
  return row ?? null;
}

export async function insertPeerHandle(input: { key: string; name: LocalizedText; active: boolean }) {
  const [row] = await db.insert(peerHandles).values(input).returning();
  return row;
}

export async function updatePeerHandleRow(
  id: string,
  input: { name: LocalizedText; active: boolean },
) {
  const [row] = await db.update(peerHandles).set(input).where(eq(peerHandles.id, id)).returning();
  return row ?? null;
}

// `restrict` against users.handleId - deleting a handle currently assigned
// to at least one learner fails loudly (isForeignKeyViolation), same
// convention about_me_chips already uses. Staff should retire a handle
// (active: false) instead.
export async function deletePeerHandleRow(id: string) {
  const [row] = await db.delete(peerHandles).where(eq(peerHandles.id, id)).returning();
  return row ?? null;
}

// Random assignment/reroll - `excludeId` (reroll only) keeps a learner from
// "rerolling" into the exact same handle they already have. Falls back to
// including it if that would leave nothing to pick from (e.g. exactly one
// active handle exists), so this can never return null while any active
// handle exists at all.
export async function pickRandomActivePeerHandleId(excludeId?: string): Promise<string | null> {
  const conditions = excludeId
    ? and(eq(peerHandles.active, true), ne(peerHandles.id, excludeId))
    : eq(peerHandles.active, true);
  const [row] = await db
    .select({ id: peerHandles.id })
    .from(peerHandles)
    .where(conditions)
    .orderBy(sql`random()`)
    .limit(1);
  if (row) return row.id;
  if (!excludeId) return null;
  // Nothing left once excluding the current handle (e.g. only one active
  // handle exists) - fall back to allowing it again rather than failing.
  const [fallback] = await db
    .select({ id: peerHandles.id })
    .from(peerHandles)
    .where(eq(peerHandles.active, true))
    .orderBy(sql`random()`)
    .limit(1);
  return fallback?.id ?? null;
}

export async function setUserHandle(userId: string, handleId: string): Promise<void> {
  await db.update(users).set({ handleId }).where(eq(users.id, userId));
}

export async function setUserHandleAndRerolledAt(userId: string, handleId: string): Promise<void> {
  await db.update(users).set({ handleId, handleRerolledAt: new Date() }).where(eq(users.id, userId));
}

export async function getUserHandleState(userId: string) {
  const [row] = await db
    .select({ handleId: users.handleId, handleRerolledAt: users.handleRerolledAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

// Account-creation auto-assign + the one-off backfill script both key off
// this - every user who doesn't have a handle yet, regardless of how long
// they've been without one.
export async function listUserIdsWithoutHandle(): Promise<string[]> {
  const rows = await db.select({ id: users.id }).from(users).where(isNull(users.handleId));
  return rows.map((r) => r.id);
}

// The peer-visible identity lookup every Arena/leaderboard/competitions
// surface resolves through - replaces the old getDisplayNamesForUserIds
// (firstName+lastInitial). Returns the full LocalizedText object, same
// "client picks the language" convention badges/chips/rankTitle already
// use, never a server-resolved single string.
export async function getHandlesForUserIds(
  userIds: string[],
): Promise<Map<string, LocalizedText | null>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, handleName: peerHandles.name })
    .from(users)
    .leftJoin(peerHandles, eq(peerHandles.id, users.handleId))
    .where(inArray(users.id, userIds));
  return new Map(rows.map((r) => [r.id, r.handleName ?? null]));
}
