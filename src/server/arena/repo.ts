import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { lessonProgress, lessons, users, worlds, xpEvents } from "@/db/schema";
import type { ArenaScope } from "./scope";

// A learner's "current world" for Arena's Worlds leaderboard (PRODUCT_SPEC.md
// §3: "XP per world and XP-per-member so small worlds can compete") is the
// highest-`order` world containing any lesson they've completed - not a
// stored membership column, since none exists (worlds are a linear content
// trail, not something a learner "joins"). A learner with zero completed
// lessons yet defaults to the lowest-order published world, so everyone has
// a team from day one. Known, accepted imprecision (same spirit as D43/D44's
// documented simplifications): story/doubt_zone lessons never get a
// lesson_progress row (D23), so a learner whose only completions are of
// those kinds reads as "no completions yet" and defaults to world #1 - an
// acceptable approximation for a social team assignment, not a graded value.
export async function getCurrentWorldIdForUser(userId: string): Promise<string | null> {
  const [furthest] = await db
    .select({ worldId: worlds.id })
    .from(lessonProgress)
    .innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
    .innerJoin(worlds, eq(worlds.id, lessons.worldId))
    .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.status, "completed")))
    .orderBy(desc(worlds.order))
    .limit(1);

  if (furthest) return furthest.worldId;

  const [firstWorld] = await db
    .select({ worldId: worlds.id })
    .from(worlds)
    .where(eq(worlds.status, "published"))
    .orderBy(worlds.order)
    .limit(1);

  return firstWorld?.worldId ?? null;
}

// The same "highest-order world with a completed lesson" rule as
// getCurrentWorldIdForUser above, computed for every learner at once - used
// by both the Worlds leaderboard's member count and its weekly-XP total.
// `worlds.order` has its own unique index (worlds_order_idx), so joining
// each user's MAX(order) back to `worlds` can never match more than one row
// - no DISTINCT ON / window function needed, which keeps this expressible in
// Drizzle's plain query builder rather than a raw SQL string.
async function currentWorldIdByUser(): Promise<Map<string, string>> {
  const maxOrderPerUser = db
    .select({
      userId: lessonProgress.userId,
      maxOrder: sql<number>`max(${worlds.order})`.as("max_order"),
    })
    .from(lessonProgress)
    .innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
    .innerJoin(worlds, eq(worlds.id, lessons.worldId))
    .where(eq(lessonProgress.status, "completed"))
    .groupBy(lessonProgress.userId)
    .as("max_order_per_user");

  const rows = await db
    .select({ userId: maxOrderPerUser.userId, worldId: worlds.id })
    .from(maxOrderPerUser)
    .innerJoin(worlds, eq(worlds.order, maxOrderPerUser.maxOrder));

  return new Map(rows.map((r) => [r.userId, r.worldId]));
}

function toNumber(value: string | number | null): number {
  return Number(value ?? 0);
}

export type LeaderboardRow = { userId: string; xp: number };

// Weekly XP per learner for `scope`, since `weekStartUtc` - every row here
// comes from xp_events (docs/ARCHITECTURE.md D26's idempotent ledger), so a
// replayed lesson/quiz can never inflate a learner's total (see the
// anti-farming reasoning given at Phase 6 kickoff). "india" and "global" are
// deliberately the same population today - there's no country field on
// `users` yet, so nothing distinguishes them until a real need for one
// arises; kept as two scope kinds now because the app's own lens switch
// (AR-01/AR-07) already names both, not because they differ in practice yet.
export async function weeklyXpByScope(scope: ArenaScope, weekStartUtc: Date): Promise<LeaderboardRow[]> {
  const conditions = [gte(xpEvents.createdAt, weekStartUtc), isNull(users.deletedAt)];

  if (scope.kind === "state") {
    conditions.push(eq(users.state, scope.state));
  }

  if (scope.kind === "world") {
    // Filter to learners currently attributed to this world (see
    // currentWorldIdByUser above) - computed in JS since it's a
    // whole-population map either way, not a per-row DB predicate.
    const worldMap = await currentWorldIdByUser();
    const memberIds = [...worldMap.entries()].filter(([, w]) => w === scope.worldId).map(([u]) => u);
    if (memberIds.length === 0) return [];
    conditions.push(inArray(xpEvents.userId, memberIds));
  }

  const rows = await db
    .select({ userId: xpEvents.userId, total: sql<string | number>`sum(${xpEvents.amount})` })
    .from(xpEvents)
    .innerJoin(users, eq(users.id, xpEvents.userId))
    .where(and(...conditions))
    .groupBy(xpEvents.userId);

  return rows.map((r) => ({ userId: r.userId, xp: toNumber(r.total) }));
}

export async function getDisplayNamesForUserIds(
  userIds: string[],
): Promise<Map<string, { firstName: string | null; lastInitial: string | null }>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, firstName: users.firstName, lastInitial: users.lastInitial })
    .from(users)
    .where(inArray(users.id, userIds));
  return new Map(rows.map((r) => [r.id, { firstName: r.firstName, lastInitial: r.lastInitial }]));
}
