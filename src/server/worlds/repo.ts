import { and, asc, eq, gt, gte, lt, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { worlds } from "@/db/schema";
import type { CreateWorldDraftInput, HotfixWorldInput, UpdateWorldDraftInput } from "./schemas";

export async function listPublishedWorlds() {
  return db
    .select()
    .from(worlds)
    .where(eq(worlds.status, "published"))
    .orderBy(asc(worlds.order));
}

// Admin editor: every world regardless of status, ordered for display.
export async function listAllWorlds() {
  return db.select().from(worlds).orderBy(asc(worlds.order));
}

export async function getWorldById(id: string) {
  const [row] = await db.select().from(worlds).where(eq(worlds.id, id)).limit(1);
  return row ?? null;
}

// Used by mentors/service.ts's unpublishMentor to block unpublishing a
// mentor that a published world still references - see docs/DATA_MODEL.md
// and the Phase 2b Checkpoint 3 kickoff discussion.
export async function listPublishedWorldsByMentorId(mentorId: string) {
  return db
    .select()
    .from(worlds)
    .where(and(eq(worlds.mentorId, mentorId), eq(worlds.status, "published")));
}

export async function insertDraftWorld(input: CreateWorldDraftInput) {
  const [row] = await db.insert(worlds).values(input).returning();
  return row;
}

// Only updates a world that's currently a draft - returns null (not an
// error) if the row doesn't exist or is published, so the service layer can
// turn that into a clear "unpublish it first" message rather than a silent
// no-op update. This is a direct single-row field write, including `order`
// - it does NOT shift other worlds out of the way, so setting `order` to a
// value another world already holds fails on the unique index (a genuine
// ambiguous conflict between two unrelated edits, not a coordinated
// reorder - see repo.test.ts's concurrent-update test). For an actual
// reorder (swap two worlds, move one to a new position), use
// moveWorldToPosition below.
export async function updateDraftWorld(input: UpdateWorldDraftInput) {
  const { id, ...rest } = input;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(worlds)
      .set(rest)
      .where(and(eq(worlds.id, id), eq(worlds.status, "draft")))
      .returning();
    return row ?? null;
  });
}

// Moves a world to a new position, shifting every world strictly between
// its old and new position by one to make room - a real reorder (swap two
// worlds, or move one from position 7 to 1), not just a single-field write.
// Works on a world of any status (draft or published) deliberately: order
// is a structural sequencing property (which world comes after which for
// the sequential-unlock rule), not reviewed content, so it doesn't need the
// draft->publish cycle updateDraftWorld enforces for title/tagline/etc.
//
// Drizzle's pg-core unique() builder has no `.deferrable()` in the version
// this project uses (confirmed by inspecting node_modules directly), so a
// DEFERRABLE INITIALLY DEFERRED unique constraint - the textbook Postgres
// answer to this exact problem - isn't available without hand-editing a
// migration out of sync with the schema file. Instead: within one
// transaction, every affected world (the mover plus everyone being shifted)
// is first moved to a distinct negative sentinel order (no real world is
// ever negative, so this can never collide with anything), then each is
// written to its real final value one at a time. At every intermediate
// statement the value being written is either negative (untaken) or a
// positive slot that was just vacated in phase one - the unique index is
// never violated mid-operation. See repo.test.ts for the swap and
// move-to-far-end cases, plus a concurrency test.
export async function moveWorldToPosition(id: string, newOrder: number) {
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(worlds).where(eq(worlds.id, id)).limit(1);
    if (!target) return null;
    if (target.order === newOrder) return target;

    const movingEarlier = newOrder < target.order;
    const affected = await tx
      .select()
      .from(worlds)
      .where(
        movingEarlier
          ? and(gte(worlds.order, newOrder), lt(worlds.order, target.order))
          : and(gt(worlds.order, target.order), lte(worlds.order, newOrder)),
      );

    // Phase 1: park everyone involved at a unique negative sentinel.
    const involved = [target, ...affected];
    for (let i = 0; i < involved.length; i++) {
      await tx
        .update(worlds)
        .set({ order: -(i + 1) })
        .where(eq(worlds.id, involved[i]!.id));
    }

    // Phase 2: write real final values - the mover to newOrder, everyone
    // else shifted by one toward the gap it left behind.
    await tx.update(worlds).set({ order: newOrder }).where(eq(worlds.id, target.id));
    for (const row of affected) {
      await tx
        .update(worlds)
        .set({ order: movingEarlier ? row.order + 1 : row.order - 1 })
        .where(eq(worlds.id, row.id));
    }

    const [updated] = await tx.select().from(worlds).where(eq(worlds.id, id)).limit(1);
    return updated ?? null;
  });
}

export async function setWorldArtKey(id: string, artKey: string) {
  const [row] = await db.update(worlds).set({ artKey }).where(eq(worlds.id, id)).returning();
  return row ?? null;
}

export async function publishWorldRow(id: string, staffId: string) {
  const [row] = await db
    .update(worlds)
    .set({ status: "published", publishedAt: new Date(), publishedBy: staffId })
    .where(and(eq(worlds.id, id), eq(worlds.status, "draft")))
    .returning();
  return row ?? null;
}

// D20 (docs/ARCHITECTURE.md): only updates a world that's currently
// PUBLISHED - returns null if the row doesn't exist or is a draft, mirroring
// updateDraftWorld's opposite-status guard.
export async function hotfixWorldRow(input: HotfixWorldInput) {
  const { id, ...rest } = input;
  const [row] = await db
    .update(worlds)
    .set(rest)
    .where(and(eq(worlds.id, id), eq(worlds.status, "published")))
    .returning();
  return row ?? null;
}

export async function unpublishWorldRow(id: string) {
  const [row] = await db
    .update(worlds)
    .set({ status: "draft", publishedAt: null, publishedBy: null })
    .where(and(eq(worlds.id, id), eq(worlds.status, "published")))
    .returning();
  return row ?? null;
}
