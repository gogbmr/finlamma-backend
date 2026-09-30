import { and, count, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  aboutMeChips,
  cheers,
  leaderboardSnapshots,
  leagueMembers,
  leagues,
  leagueSettlements,
  lessonProgress,
  lessons,
  userAboutMeChips,
  users,
  worldXpSnapshots,
  worlds,
  xpEvents,
} from "@/db/schema";
import type { LocalizedText } from "@/db/schema/_helpers";
import { istDateStartUtc } from "@/lib/ist-date";
import type { DbOrTx } from "@/server/economy/repo";
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
export async function currentWorldIdByUser(): Promise<Map<string, string>> {
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
export async function weeklyXpByScope(
  scope: ArenaScope,
  weekStartUtc: Date,
  weekEndUtc?: Date,
): Promise<LeaderboardRow[]> {
  const conditions = [gte(xpEvents.createdAt, weekStartUtc), isNull(users.deletedAt)];
  if (weekEndUtc) conditions.push(lt(xpEvents.createdAt, weekEndUtc));

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

// XP summed per userId in [sinceUtc, beforeUtc) (beforeUtc omitted = open-
// ended, "since sinceUtc"). The shared primitive behind both the weekly
// Worlds leaderboard and the daily sparkline rollup job below - only the
// time window differs between the two callers.
async function xpByUserInRange(sinceUtc: Date, beforeUtc?: Date): Promise<Map<string, number>> {
  const conditions = [gte(xpEvents.createdAt, sinceUtc), isNull(users.deletedAt)];
  if (beforeUtc) conditions.push(lt(xpEvents.createdAt, beforeUtc));

  const rows = await db
    .select({ userId: xpEvents.userId, total: sql<string | number>`sum(${xpEvents.amount})` })
    .from(xpEvents)
    .innerJoin(users, eq(users.id, xpEvents.userId))
    .where(and(...conditions))
    .groupBy(xpEvents.userId);

  return new Map(rows.map((r) => [r.userId, toNumber(r.total)]));
}

export type WorldXpTotals = { worldId: string; xp: number; memberCount: number };

// XP + member count per world in [sinceUtc, beforeUtc) - the Worlds
// leaderboard (AR-04/05) and the daily sparkline rollup job both call this,
// just with different time windows. A world with zero currently-attributed
// members simply doesn't appear in the result.
export async function xpByWorldInRange(sinceUtc: Date, beforeUtc?: Date): Promise<WorldXpTotals[]> {
  const worldMap = await currentWorldIdByUser();
  const membersByWorld = new Map<string, string[]>();
  for (const [userId, worldId] of worldMap) {
    membersByWorld.set(worldId, [...(membersByWorld.get(worldId) ?? []), userId]);
  }
  if (membersByWorld.size === 0) return [];

  const xpByUser = await xpByUserInRange(sinceUtc, beforeUtc);

  return [...membersByWorld.entries()].map(([worldId, memberIds]) => ({
    worldId,
    memberCount: memberIds.length,
    xp: memberIds.reduce((sum, id) => sum + (xpByUser.get(id) ?? 0), 0),
  }));
}

export async function listPublishedWorldsOrdered() {
  return db
    .select({ id: worlds.id, title: worlds.title, order: worlds.order })
    .from(worlds)
    .where(eq(worlds.status, "published"))
    .orderBy(worlds.order);
}

// Writes today's (IST) per-world XP total - src/inngest/functions/
// arena-world-xp-rollup.ts calls this once daily. Idempotent the same way
// every other daily rollup in this codebase is (D26-style
// onConflictDoUpdate on the (worldId, dateIst) unique index) - a retried run
// for the same day overwrites with the same recomputed number rather than
// erroring or double-counting, since nothing here is a ledger credit.
export async function upsertWorldXpSnapshotsForDate(dateIst: string): Promise<number> {
  const startUtc = istDateStartUtc(new Date(`${dateIst}T00:00:00Z`));
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  const totals = await xpByWorldInRange(startUtc, endUtc);

  for (const t of totals) {
    await db
      .insert(worldXpSnapshots)
      .values({ worldId: t.worldId, dateIst, xpTotal: t.xp, memberCount: t.memberCount })
      .onConflictDoUpdate({
        target: [worldXpSnapshots.worldId, worldXpSnapshots.dateIst],
        set: { xpTotal: t.xp, memberCount: t.memberCount },
      });
  }
  return totals.length;
}

// Oldest-first daily totals for the last `days` IST days (AR-04's 7-day
// sparkline) - a world with fewer days of history than `days` just returns
// fewer points, never a fabricated zero-filled past (matches D44's "empty,
// not fabricated" precedent for the portfolio equity curve).
export async function getWorldXpSparklines(
  worldIds: string[],
  days: number,
): Promise<Map<string, { date: string; xp: number }[]>> {
  if (worldIds.length === 0) return new Map();
  const rows = await db
    .select({ worldId: worldXpSnapshots.worldId, date: worldXpSnapshots.dateIst, xp: worldXpSnapshots.xpTotal })
    .from(worldXpSnapshots)
    .where(inArray(worldXpSnapshots.worldId, worldIds))
    .orderBy(desc(worldXpSnapshots.dateIst));

  const byWorld = new Map<string, { date: string; xp: number }[]>();
  for (const row of rows) {
    const list = byWorld.get(row.worldId) ?? [];
    if (list.length < days) list.push({ date: row.date, xp: row.xp });
    byWorld.set(row.worldId, list);
  }
  for (const list of byWorld.values()) list.reverse();
  return byWorld;
}

export type RecentXpEvent = {
  userId: string;
  firstName: string | null;
  lastInitial: string | null;
  amount: number;
  createdAt: Date;
};

// AR-03's activity ticker - the most recent real XP credits, newest first.
// Deliberately unfiltered by source kind (a lesson, a badge, a cheer, ...)
// since the ticker is meant to feel alive, not curated; excludes deleted
// users the same way every other Arena query does.
export async function listRecentXpEvents(limit: number): Promise<RecentXpEvent[]> {
  const rows = await db
    .select({
      userId: xpEvents.userId,
      firstName: users.firstName,
      lastInitial: users.lastInitial,
      amount: xpEvents.amount,
      createdAt: xpEvents.createdAt,
    })
    .from(xpEvents)
    .innerJoin(users, eq(users.id, xpEvents.userId))
    .where(isNull(users.deletedAt))
    .orderBy(desc(xpEvents.createdAt))
    .limit(limit);
  return rows;
}

// --- League settlement (Phase 6 Checkpoint 3, docs/ARCHITECTURE.md D55) ---

// leagues has one persistent row per scope (see the top-of-file scope-key
// comment) - get-or-create rather than a separate seed step, since the set
// of scopes that ever need a row (every world, every state with an active
// learner, india, global) isn't known ahead of time.
export async function ensureLeague(scope: string) {
  const [existing] = await db.select().from(leagues).where(eq(leagues.scope, scope)).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(leagues)
    .values({ scope })
    .onConflictDoNothing({ target: leagues.scope })
    .returning();
  if (created) return created;
  // Lost a create race against a concurrent settlement run for the same
  // scope (shouldn't happen in practice - settlement runs once, sequentially
  // per scope - but a plain re-select is the honest fallback rather than
  // assuming created is never null).
  const [row] = await db.select().from(leagues).where(eq(leagues.scope, scope)).limit(1);
  return row!;
}

// Replaces a scope's entire current membership - the ranked list this
// settlement computed IS the new membership; a learner absent from it
// (zero XP this week) simply isn't a current member, same "always sent
// whole, never merged" reasoning src/server/arena/repo.ts's chip-selection
// replace already uses.
export async function replaceLeagueMembers(
  leagueId: string,
  entries: { userId: string; zone: "promote" | "safe" | "demote"; rank: number }[],
) {
  await db.transaction(async (tx) => {
    await tx.delete(leagueMembers).where(eq(leagueMembers.leagueId, leagueId));
    if (entries.length === 0) return;
    await tx.insert(leagueMembers).values(entries.map((e) => ({ leagueId, ...e })));
  });
}

// Bulk read for the leaderboard response's per-row zone (D54 visibility) -
// one query per scope's whole membership rather than one per row.
export async function getLeagueZonesForScope(scope: string): Promise<Map<string, "promote" | "safe" | "demote">> {
  const rows = await db
    .select({ userId: leagueMembers.userId, zone: leagueMembers.zone })
    .from(leagues)
    .innerJoin(leagueMembers, eq(leagueMembers.leagueId, leagues.id))
    .where(eq(leagues.scope, scope));
  return new Map(rows.map((r) => [r.userId, r.zone]));
}

export async function getLastWeekRanksForScope(
  scope: string,
  weekStartDate: string,
): Promise<Map<string, number>> {
  const [row] = await db
    .select({ rankings: leaderboardSnapshots.rankings })
    .from(leaderboardSnapshots)
    .where(and(eq(leaderboardSnapshots.scope, scope), eq(leaderboardSnapshots.weekStartDate, weekStartDate)))
    .limit(1);
  if (!row) return new Map();
  return new Map(row.rankings.map((r) => [r.userId, r.rank]));
}

export type SnapshotEntry = { rank: number; poolSize: number; prevRank: number | null };

// Phase 6 Checkpoint 6 (PR-01/03/30 percentile/rank wiring): a single
// learner's entry in one scope's settled snapshot for one week, or null if
// there's nothing to report - the scope never settled that week (didn't
// exist yet, or was below the D52 privacy floor), or the learner had no XP
// that week even though the scope itself settled for others. Callers treat
// null as "omit this rank cleanly," never as a 0 or a fabricated value.
export async function getSnapshotEntryForUser(
  scope: string,
  weekStartDate: string,
  userId: string,
): Promise<SnapshotEntry | null> {
  const [row] = await db
    .select({ poolSize: leaderboardSnapshots.poolSize, rankings: leaderboardSnapshots.rankings })
    .from(leaderboardSnapshots)
    .where(and(eq(leaderboardSnapshots.scope, scope), eq(leaderboardSnapshots.weekStartDate, weekStartDate)))
    .limit(1);
  if (!row) return null;
  const entry = row.rankings.find((r) => r.userId === userId);
  if (!entry) return null;
  return { rank: entry.rank, poolSize: row.poolSize, prevRank: entry.prevRank };
}

// Never overwritten once written for a given (weekStartDate, scope) - a
// retried settlement run for the same week just no-ops on conflict, same
// "the finished week's record is permanent" reasoning report_snapshots
// already follows.
export async function upsertLeaderboardSnapshotIfNew(input: {
  weekStartDate: string;
  scope: string;
  poolSize: number;
  rankings: { userId: string; rank: number; xp: number; zone: string; prevRank: number | null }[];
}) {
  await db
    .insert(leaderboardSnapshots)
    .values(input)
    .onConflictDoNothing({ target: [leaderboardSnapshots.weekStartDate, leaderboardSnapshots.scope] });
}

// The idempotency mechanism for the whole weekly payout - a conflict here
// (this user already has a settlement row for this week) means "already
// paid," full stop, checked BEFORE any VM/badge credit is attempted, inside
// the same transaction as both (src/server/arena/service.ts's
// settleArenaLeaguesForWeek).
export async function insertLeagueSettlementIfNew(
  txDb: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: { userId: string; weekStartDate: string; scope: string; zone: "promote" | "safe" | "demote"; xp: number; vmAwarded: number },
) {
  const [row] = await txDb
    .insert(leagueSettlements)
    .values(input)
    .onConflictDoNothing({ target: [leagueSettlements.userId, leagueSettlements.weekStartDate] })
    .returning();
  return row ?? null;
}

// docs/ARCHITECTURE.md D56: the weekly per-(sender,receiver) cheer-XP cap -
// sums XP already credited from THIS sender to THIS receiver via cheers
// since the current IST week's start, so sendCheer can clamp against
// whatever of the pair's weekly allowance remains.
export async function sumCheerXpFromSenderToReceiverSince(
  senderId: string,
  receiverId: string,
  sinceUtc: Date,
  txDb: DbOrTx = db,
): Promise<number> {
  const [row] = await txDb
    .select({ total: sql<string | number>`coalesce(sum(${xpEvents.amount}), 0)` })
    .from(cheers)
    .innerJoin(
      xpEvents,
      and(eq(xpEvents.sourceType, "cheer"), eq(xpEvents.sourceId, cheers.id), eq(xpEvents.userId, cheers.receiverId)),
    )
    .where(and(eq(cheers.senderId, senderId), eq(cheers.receiverId, receiverId), gte(cheers.createdAt, sinceUtc)));
  return toNumber(row?.total ?? 0);
}

// --- Cheers (AR-12, docs/ARCHITECTURE.md D53) ---

export async function findCheerableUser(userId: string) {
  const [row] = await db
    .select({ id: users.id, deletedAt: users.deletedAt, preferences: users.preferences })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

// One cheer per (sender, receiver) per IST day - the DB's own unique index
// is the idempotency mechanism (D26-style onConflictDoNothing), not an
// application-level check, so a race between two rapid identical requests
// can never double-insert. Returns null on a conflict (already cheered this
// pair today), which the service reads as "no additional XP this time."
export async function insertCheerIfNew(
  senderId: string,
  receiverId: string,
  cheerDateIst: string,
  txDb: DbOrTx = db,
) {
  const [row] = await txDb
    .insert(cheers)
    .values({ senderId, receiverId, cheerDateIst })
    .onConflictDoNothing({ target: [cheers.senderId, cheers.receiverId, cheers.cheerDateIst] })
    .returning();
  return row ?? null;
}

// How much XP a receiver has already banked from cheers today - what the
// daily cap (settings_kv.cheer_daily_xp_cap) clamps against. Scoped to
// sourceType 'cheer' only, never the receiver's total XP for the day, since
// the cap is specifically about bounding the CHEERS income stream, not
// activity in general.
export async function sumCheerXpCreditedToday(receiverId: string, todayIst: string, txDb: DbOrTx = db): Promise<number> {
  const startUtc = istDateStartUtc(new Date(`${todayIst}T00:00:00Z`));
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  const [row] = await txDb
    .select({ total: sql<string | number>`coalesce(sum(${xpEvents.amount}), 0)` })
    .from(xpEvents)
    .where(
      and(
        eq(xpEvents.userId, receiverId),
        eq(xpEvents.sourceType, "cheer"),
        gte(xpEvents.createdAt, startUtc),
        lt(xpEvents.createdAt, endUtc),
      ),
    );
  return toNumber(row?.total ?? 0);
}

// The aggregate-only weekly count a receiver sees about themselves
// (docs/ARCHITECTURE.md D53: "12 cheers this week", never sender identity).
export async function countCheersReceivedSince(receiverId: string, sinceUtc: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<string | number>`count(*)` })
    .from(cheers)
    .where(and(eq(cheers.receiverId, receiverId), gte(cheers.createdAt, sinceUtc)));
  return toNumber(row?.count ?? 0);
}

// --- About-me chips (AR-20, docs/ARCHITECTURE.md D36) ---

export async function listAboutMeChips() {
  return db.select().from(aboutMeChips).orderBy(aboutMeChips.createdAt);
}

export async function listActiveAboutMeChips() {
  return db.select().from(aboutMeChips).where(eq(aboutMeChips.active, true)).orderBy(aboutMeChips.createdAt);
}

export async function getAboutMeChipById(id: string) {
  const [row] = await db.select().from(aboutMeChips).where(eq(aboutMeChips.id, id)).limit(1);
  return row ?? null;
}

export async function insertAboutMeChip(input: { name: LocalizedText; iconKey: string | null; active: boolean }) {
  const [row] = await db.insert(aboutMeChips).values(input).returning();
  return row;
}

export async function updateAboutMeChipRow(
  id: string,
  input: { name: LocalizedText; iconKey: string | null; active: boolean },
) {
  const [row] = await db.update(aboutMeChips).set(input).where(eq(aboutMeChips.id, id)).returning();
  return row ?? null;
}

export async function deleteAboutMeChipRow(id: string) {
  const [row] = await db.delete(aboutMeChips).where(eq(aboutMeChips.id, id)).returning();
  return row ?? null;
}

export async function getSelectedChipIdsForUser(userId: string): Promise<string[]> {
  const rows = await db
    .select({ chipId: userAboutMeChips.chipId })
    .from(userAboutMeChips)
    .where(eq(userAboutMeChips.userId, userId));
  return rows.map((r) => r.chipId);
}

// Replaces the learner's whole chip selection atomically (delete-then-insert
// in one transaction) - same "always sent whole, never merged" reasoning
// users.preferences already follows, since the app always holds the full
// current selection before showing the picker. The service layer validates
// every id is a currently-active chip before calling this - a bad id here
// would fail loudly (the chipId FK is `onDelete: "restrict"`), which is
// exactly the backstop wanted if that validation is ever bypassed.
export async function replaceUserChipSelection(userId: string, chipIds: string[]) {
  await db.transaction(async (tx) => {
    await tx.delete(userAboutMeChips).where(eq(userAboutMeChips.userId, userId));
    if (chipIds.length === 0) return;
    await tx.insert(userAboutMeChips).values(chipIds.map((chipId) => ({ userId, chipId })));
  });
}

export async function getSelectedChipsForUser(userId: string) {
  const rows = await db
    .select({ id: aboutMeChips.id, name: aboutMeChips.name, iconKey: aboutMeChips.iconKey })
    .from(userAboutMeChips)
    .innerJoin(aboutMeChips, eq(aboutMeChips.id, userAboutMeChips.chipId))
    .where(eq(userAboutMeChips.userId, userId));
  return rows;
}

// --- Public profile support (AR-20) ---

export async function getWorldTitleById(worldId: string): Promise<LocalizedText | null> {
  const [row] = await db.select({ title: worlds.title }).from(worlds).where(eq(worlds.id, worldId)).limit(1);
  return row?.title ?? null;
}

export async function countPublishedLessonsInWorld(worldId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(lessons)
    .where(and(eq(lessons.worldId, worldId), eq(lessons.status, "published")));
  return row?.n ?? 0;
}

export async function countCompletedLessonsForUserInWorld(userId: string, worldId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(lessonProgress)
    .innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, "completed"),
        eq(lessons.worldId, worldId),
      ),
    );
  return row?.n ?? 0;
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
