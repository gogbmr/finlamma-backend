import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mentors } from "@/db/schema";
import type { CreateMentorDraftInput, HotfixMentorInput, UpdateMentorDraftInput } from "./schemas";

export async function listPublishedMentors() {
  return db
    .select()
    .from(mentors)
    .where(eq(mentors.status, "published"))
    .orderBy(asc(mentors.order));
}

export async function getPublishedMentorByKey(key: string) {
  const [row] = await db
    .select()
    .from(mentors)
    .where(and(eq(mentors.key, key), eq(mentors.status, "published")))
    .limit(1);
  return row ?? null;
}

// Admin editor: every mentor regardless of status, ordered for display.
export async function listAllMentors() {
  return db.select().from(mentors).orderBy(asc(mentors.order));
}

export async function getMentorById(id: string) {
  const [row] = await db.select().from(mentors).where(eq(mentors.id, id)).limit(1);
  return row ?? null;
}

export async function insertDraftMentor(input: CreateMentorDraftInput) {
  const [row] = await db.insert(mentors).values(input).returning();
  return row;
}

// Only updates a mentor that's currently a draft - returns null (not an
// error) if the row doesn't exist or is published, so the service layer can
// turn that into a clear "unpublish it first" message rather than a silent
// no-op update.
export async function updateDraftMentor(input: UpdateMentorDraftInput) {
  const { id, ...rest } = input;
  const [row] = await db
    .update(mentors)
    .set(rest)
    .where(and(eq(mentors.id, id), eq(mentors.status, "draft")))
    .returning();
  return row ?? null;
}

export async function setMentorArtKey(id: string, artKey: string) {
  const [row] = await db.update(mentors).set({ artKey }).where(eq(mentors.id, id)).returning();
  return row ?? null;
}

export async function publishMentorRow(id: string, staffId: string) {
  const [row] = await db
    .update(mentors)
    .set({ status: "published", publishedAt: new Date(), publishedBy: staffId })
    .where(and(eq(mentors.id, id), eq(mentors.status, "draft")))
    .returning();
  return row ?? null;
}

// D20 (docs/ARCHITECTURE.md): only updates a mentor that's currently
// PUBLISHED - returns null if the row doesn't exist or is a draft, mirroring
// updateDraftMentor's opposite-status guard.
export async function hotfixMentorRow(input: HotfixMentorInput) {
  const { id, ...rest } = input;
  const [row] = await db
    .update(mentors)
    .set(rest)
    .where(and(eq(mentors.id, id), eq(mentors.status, "published")))
    .returning();
  return row ?? null;
}

export async function unpublishMentorRow(id: string) {
  const [row] = await db
    .update(mentors)
    .set({ status: "draft", publishedAt: null, publishedBy: null })
    .where(and(eq(mentors.id, id), eq(mentors.status, "published")))
    .returning();
  return row ?? null;
}
