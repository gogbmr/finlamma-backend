import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { questions } from "@/db/schema";
import type { CreateQuestionDraftInput, UpdateQuestionDraftInput } from "./schemas";

// Admin editor: every question regardless of status, ordered for display.
export async function listAllQuestions() {
  return db.select().from(questions).orderBy(asc(questions.createdAt));
}

export async function getQuestionById(id: string) {
  const [row] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
  return row ?? null;
}

// Used by lessons/service.ts's publish gate (docs/ARCHITECTURE.md D18) to
// check every question id a lesson's content references actually exists
// and is published. Empty input returns [] without a query - a lesson kind
// with no question references (story, doubt_zone) shouldn't touch the DB.
export async function getQuestionsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(questions).where(inArray(questions.id, ids));
}

export async function insertDraftQuestion(input: CreateQuestionDraftInput) {
  const [row] = await db.insert(questions).values(input).returning();
  return row;
}

// Only updates a question that's currently a draft - returns null (not an
// error) if the row doesn't exist or is published, so the service layer can
// turn that into a clear "unpublish it first" message rather than a silent
// no-op update. `format` is deliberately not part of `input` - it's
// immutable after creation (see UpdateQuestionDraftSchema).
export async function updateDraftQuestion(input: UpdateQuestionDraftInput) {
  const { id, ...rest } = input;
  const [row] = await db
    .update(questions)
    .set(rest)
    .where(and(eq(questions.id, id), eq(questions.status, "draft")))
    .returning();
  return row ?? null;
}

export async function publishQuestionRow(id: string, staffId: string) {
  const [row] = await db
    .update(questions)
    .set({ status: "published", publishedAt: new Date(), publishedBy: staffId })
    .where(and(eq(questions.id, id), eq(questions.status, "draft")))
    .returning();
  return row ?? null;
}

export async function unpublishQuestionRow(id: string) {
  const [row] = await db
    .update(questions)
    .set({ status: "draft", publishedAt: null, publishedBy: null })
    .where(and(eq(questions.id, id), eq(questions.status, "published")))
    .returning();
  return row ?? null;
}
