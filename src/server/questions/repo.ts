import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { questionRevisions, questions } from "@/db/schema";
import type {
  CreateQuestionDraftInput,
  HotfixQuestionInput,
  UpdateQuestionDraftInput,
} from "./schemas";

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

// Snapshots the row's CURRENT content as a `question_revisions` row at its
// CURRENT `revision` value - called right after publishQuestionRow/
// hotfixQuestionRow bump `revision`, inside the same transaction, so every
// revision `questions.revision` ever holds has a matching, recoverable
// snapshot (D22, docs/ARCHITECTURE.md). Never called for a plain draft
// edit, since a draft isn't live yet.
async function snapshotQuestionRevision(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  row: typeof questions.$inferSelect,
): Promise<void> {
  await tx.insert(questionRevisions).values({
    questionId: row.id,
    revision: row.revision,
    prompt: row.prompt,
    explanation: row.explanation,
    payload: row.payload,
    answer: row.answer,
  });
}

// Bumps `revision` (0 on a fresh draft -> 1 on first publish, so this is
// also what makes `questions.revision` mean "how many times this question's
// content has gone live") and snapshots the newly-published content as that
// revision, atomically - see D21/D22, docs/ARCHITECTURE.md.
export async function publishQuestionRow(id: string, staffId: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(questions)
      .set({
        status: "published",
        publishedAt: new Date(),
        publishedBy: staffId,
        revision: sql`${questions.revision} + 1`,
      })
      .where(and(eq(questions.id, id), eq(questions.status, "draft")))
      .returning();
    if (!row) return null;
    await snapshotQuestionRevision(tx, row);
    return row;
  });
}

// D20 (docs/ARCHITECTURE.md): only updates a question that's currently
// PUBLISHED (the opposite guard from updateDraftQuestion) - returns null if
// the row doesn't exist or is a draft, so the service layer can turn that
// into a clear error rather than a silent no-op. Bumps `revision` and
// snapshots the new content atomically, same as publishQuestionRow (D22) -
// an in-flight quiz answer graded against the pre-hotfix revision (see
// src/server/quiz-attempts/service.ts's servedRevision) is completely
// unaffected by this.
export async function hotfixQuestionRow(input: HotfixQuestionInput) {
  const { id, ...rest } = input;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(questions)
      .set({ ...rest, revision: sql`${questions.revision} + 1` })
      .where(and(eq(questions.id, id), eq(questions.status, "published")))
      .returning();
    if (!row) return null;
    await snapshotQuestionRevision(tx, row);
    return row;
  });
}

// The exact content a question had at one specific past (or current)
// revision - used by src/server/quiz-attempts/service.ts's submitAnswer to
// grade against the revision that was actually SERVED, never the live
// `questions` row, which may have since been hotfixed.
export async function getQuestionRevision(questionId: string, revision: number) {
  const [row] = await db
    .select()
    .from(questionRevisions)
    .where(and(eq(questionRevisions.questionId, questionId), eq(questionRevisions.revision, revision)))
    .limit(1);
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
