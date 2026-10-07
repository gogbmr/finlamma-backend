// Corrective fix for a real bug in scripts/seed-dev-content.ts: that script
// inserted its placeholder `questions` rows directly with `status:
// "published"`, bypassing the real publish path (src/server/questions/
// repo.ts's publishQuestionRow), which is also what writes the matching
// `question_revisions` snapshot row (D22, docs/ARCHITECTURE.md). The result:
// every placeholder question was published with `revision: 0` and NO
// question_revisions row at all - but src/server/quiz-attempts/service.ts's
// real grading flow (getQuestionRevision) strictly looks up a revision
// snapshot by (questionId, servedRevision) and fails if it's missing, so
// none of these placeholder questions were actually answerable through the
// real app flow.
//
// This script finds every `[PLACEHOLDER]`-prefixed question still at
// revision 0, bumps it to revision 1 (matching what a real first publish
// does), and writes the matching question_revisions snapshot of its current
// content - i.e. exactly what publishQuestionRow would have done, applied
// after the fact. Idempotent: only touches rows still at revision 0 and
// without an existing revision-1 snapshot, so re-running after a partial
// failure is safe.
//
// One-off, not added to package.json - run directly via
// `tsx scripts/fix-dev-content-question-revisions.ts`.
import "../envConfig";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../src/db/client";
import { questionRevisions, questions } from "../src/db/schema";

async function fix() {
  const broken = await db
    .select()
    .from(questions)
    .where(
      and(
        eq(questions.status, "published"),
        eq(questions.revision, 0),
        sql`${questions.prompt}::text LIKE ${"%[PLACEHOLDER]%"}`,
      ),
    );

  if (broken.length === 0) {
    console.log("No placeholder questions at revision 0 found - nothing to fix.");
    return;
  }

  let fixed = 0;
  for (const row of broken) {
    await db.transaction(async (tx) => {
      await tx
        .update(questions)
        .set({ revision: 1 })
        .where(and(eq(questions.id, row.id), eq(questions.revision, 0)));
      await tx
        .insert(questionRevisions)
        .values({
          questionId: row.id,
          revision: 1,
          prompt: row.prompt,
          explanation: row.explanation,
          payload: row.payload,
          answer: row.answer,
        })
        .onConflictDoNothing({
          target: [questionRevisions.questionId, questionRevisions.revision],
        });
    });
    fixed++;
  }

  console.log(`Fixed ${fixed} placeholder question(s): bumped to revision 1, snapshot written.`);
}

fix()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
