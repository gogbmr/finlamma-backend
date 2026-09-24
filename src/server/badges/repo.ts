import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { badges, userBadges } from "@/db/schema";
import type { CreateBadgeDraftInput, UpdateBadgeDraftInput } from "./schemas";

export async function listPublishedBadges() {
  return db.select().from(badges).where(eq(badges.status, "published")).orderBy(asc(badges.createdAt));
}

// Admin editor: every badge regardless of status.
export async function listAllBadges() {
  return db.select().from(badges).orderBy(asc(badges.createdAt));
}

export async function getBadgeById(id: string) {
  const [row] = await db.select().from(badges).where(eq(badges.id, id)).limit(1);
  return row ?? null;
}

export async function insertDraftBadge(input: CreateBadgeDraftInput) {
  const [row] = await db.insert(badges).values(input).returning();
  return row;
}

// Only updates a badge that's currently a draft - returns null (not an
// error) otherwise, same "unpublish first to edit" pattern as
// mentors/worlds.
export async function updateDraftBadge(input: UpdateBadgeDraftInput) {
  const { id, ...rest } = input;
  const [row] = await db
    .update(badges)
    .set(rest)
    .where(eq(badges.id, id))
    .returning();
  return row ?? null;
}

export async function publishBadgeRow(id: string, staffId: string) {
  const [row] = await db
    .update(badges)
    .set({ status: "published", publishedAt: new Date(), publishedBy: staffId })
    .where(eq(badges.id, id))
    .returning();
  return row ?? null;
}

export async function unpublishBadgeRow(id: string) {
  const [row] = await db
    .update(badges)
    .set({ status: "draft", publishedAt: null, publishedBy: null })
    .where(eq(badges.id, id))
    .returning();
  return row ?? null;
}

export async function listUnlockedBadgeIdsForUser(userId: string): Promise<Set<string>> {
  const rows = await db.select({ badgeId: userBadges.badgeId }).from(userBadges).where(eq(userBadges.userId, userId));
  return new Set(rows.map((r) => r.badgeId));
}

export async function listUserBadgesForUser(userId: string) {
  return db.select().from(userBadges).where(eq(userBadges.userId, userId));
}

// Idempotent, once per (user, badge) ever - the unique index is the actual
// guarantee (D26-style: insert, treat a conflict as "already awarded"), not
// an application-level "already has it?" check, which would be a TOCTOU
// race under concurrent evaluation calls for the same user.
export async function insertUserBadgeIfAbsent(userId: string, badgeId: string) {
  const [row] = await db
    .insert(userBadges)
    .values({ userId, badgeId })
    .onConflictDoNothing({ target: [userBadges.userId, userBadges.badgeId] })
    .returning();
  return row ?? null;
}
