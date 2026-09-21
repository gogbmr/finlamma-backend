import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { worlds } from "@/db/schema";
import type { CreateWorldDraftInput, UpdateWorldDraftInput } from "./schemas";

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
// no-op update. Wrapped in a transaction (on top of the DB-level unique
// index on `order`, which is what actually enforces uniqueness atomically)
// so two concurrent reorders that collide on the same target order value
// never leave two worlds sharing an order - one succeeds, the other hits
// the unique constraint and the service maps that to a clear CONFLICT - see
// repo.test.ts's concurrent-reorder test.
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

export async function unpublishWorldRow(id: string) {
  const [row] = await db
    .update(worlds)
    .set({ status: "draft", publishedAt: null, publishedBy: null })
    .where(and(eq(worlds.id, id), eq(worlds.status, "published")))
    .returning();
  return row ?? null;
}
