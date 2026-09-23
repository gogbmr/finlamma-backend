import { logActivity } from "@/lib/activity-log";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import { creditLessonCompletion } from "@/server/economy/service";
import { getPublishedLesson } from "@/server/lessons/repo";
import { extractQuestionIds } from "@/server/lessons/service";
import { VideoContentSchema } from "@/server/lessons/schemas";
import { completeLessonProgress, startLessonProgress } from "@/server/lesson-progress/repo";
import { getQuestionById, getQuestionRevision } from "@/server/questions/repo";
import { answerSchemaForFormat, type QuestionFormat } from "@/server/questions/schemas";
import { getLessonFlowScoringSettings } from "@/server/settings/service";
import {
  completeAttempt,
  countAttemptsForUserLesson,
  getAttemptById,
  getLatestInProgressAttempt,
  getPreviousQuestionAnswer,
  getQuestionAnswer,
  gradeQuestionAnswer,
  insertAttempt,
  insertServedQuestionAnswer,
  listQuestionAnswersForAttempt,
} from "./repo";
import { answerMatches, computeScore, type QuizKind } from "./scoring";

type RequestMeta = ReturnType<typeof requestMeta>;
type QuestionAnswerRow = NonNullable<Awaited<ReturnType<typeof getQuestionAnswer>>>;

function quizKindForLesson(kind: string): QuizKind {
  return kind === "video" ? "popQuiz" : "practiceQuiz";
}

async function assertGradedLesson(lessonId: string) {
  const lesson = await getPublishedLesson(lessonId);
  if (!lesson) throw new AppError("NOT_FOUND", "No published lesson with this id");

  const questionIds = extractQuestionIds(lesson.kind, lesson.content);
  if (questionIds.length === 0) {
    throw new AppError("VALIDATION_FAILED", "This lesson has no graded steps");
  }
  return { lesson, questionIds };
}

function assertStepInRange(stepIndex: number, totalSteps: number) {
  if (!Number.isInteger(stepIndex) || stepIndex < 1 || stepIndex > totalSteps) {
    throw new AppError("VALIDATION_FAILED", `stepIndex must be between 1 and ${totalSteps}`);
  }
}

async function timerSecondsForStep(
  lesson: { kind: string; content: unknown },
  stepIndex: number,
  practiceQuizTimerSeconds: number,
): Promise<number> {
  if (lesson.kind === "video") {
    const parsed = VideoContentSchema.safeParse(lesson.content);
    const cueTimer = parsed.success ? parsed.data.cues[stepIndex - 1]?.timerSeconds : undefined;
    if (cueTimer) return cueTimer;
  }
  return practiceQuizTimerSeconds;
}

// Server-timed anti-cheat (docs/ARCHITECTURE.md D21): this is the ONLY way
// a client learns `servedAt` - it's stamped here, server-side, never
// trusted from the client. No-skip-ahead is enforced by only ever allowing
// a NEW step's row to be created when the immediately preceding step is
// already answered (or this is step 1) - re-serving the current unanswered
// step is idempotent (same servedAt/timerSeconds returned, timer doesn't
// reset), and re-serving an already-answered step is rejected, since that
// data belongs to the answer endpoint's own response, not this one.
export async function serveStep(
  user: { id: string },
  lessonId: string,
  stepIndex: number,
  meta: RequestMeta,
) {
  const { lesson, questionIds } = await assertGradedLesson(lessonId);
  assertStepInRange(stepIndex, questionIds.length);

  let attempt = await getLatestInProgressAttempt(user.id, lessonId);
  if (!attempt) {
    if (stepIndex !== 1) {
      throw new AppError("CONFLICT", "No active attempt for this lesson - start from step 1");
    }
    const attemptNumber = (await countAttemptsForUserLesson(user.id, lessonId)) + 1;
    attempt = await insertAttempt({
      userId: user.id,
      lessonId,
      attemptNumber,
      isFirstPass: attemptNumber === 1,
    });
    // Idempotent (onConflictDoNothing) - a no-op if this lesson already has
    // a lesson_progress row (e.g. a replay attempt after already
    // completing it once), never downgrading a completed row back to
    // in_progress. See docs/ARCHITECTURE.md D23.
    await startLessonProgress(user.id, lessonId);
    await logActivity({
      actorType: "user",
      actorId: user.id,
      action: "quiz_attempt.started",
      targetType: "quiz_attempt",
      targetId: attempt.id,
      metadata: { lessonId, attemptNumber, isFirstPass: attempt.isFirstPass },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  let served = await getQuestionAnswer(attempt.id, stepIndex);
  if (served) {
    if (served.answeredAt) {
      throw new AppError("CONFLICT", "This step has already been answered");
    }
    // Idempotent resume (e.g. app reopened mid-question) - same servedAt/
    // timerSeconds handed back, the timer does not restart.
  } else {
    if (stepIndex > 1) {
      const previous = await getPreviousQuestionAnswer(attempt.id, stepIndex);
      if (!previous || !previous.answeredAt) {
        throw new AppError("CONFLICT", "Not the current step - answer earlier steps first");
      }
    }
    const settings = await getLessonFlowScoringSettings();
    const questionId = questionIds[stepIndex - 1]!;
    const question = await getQuestionById(questionId);
    if (!question || question.status !== "published") {
      throw new AppError("NOT_FOUND", "This step's question is no longer available");
    }
    served = await insertServedQuestionAnswer({
      attemptId: attempt.id,
      questionId,
      stepIndex,
      servedAt: new Date(),
      timerSeconds: await timerSecondsForStep(lesson, stepIndex, settings.practiceQuizTimerSeconds),
      // Captured once, here, and never touched again (including on an
      // idempotent re-serve of the same unanswered step below) - this is
      // what grading uses, not the live `questions.revision`, so a hotfix
      // landing after this moment can never affect this step (D22).
      servedRevision: question.revision,
    });
  }

  const question = await getQuestionById(served.questionId);
  if (!question) throw new AppError("NOT_FOUND", "This step's question is no longer available");

  return {
    attemptId: attempt.id,
    stepIndex,
    totalSteps: questionIds.length,
    questionId: question.id,
    format: question.format,
    prompt: question.prompt,
    payload: question.payload,
    timerSeconds: served.timerSeconds,
    servedAt: served.servedAt.toISOString(),
  };
}

function buildAnswerResponse(
  row: QuestionAnswerRow,
  revision: { answer: unknown; explanation: unknown },
  totalSteps: number,
  attempt: { status: string; totalXpPreview: number | null },
) {
  return {
    attemptId: row.attemptId,
    stepIndex: row.stepIndex,
    totalSteps,
    isCorrect: row.isCorrect!,
    timedOut: row.timedOut!,
    correctAnswer: revision.answer,
    explanation: revision.explanation,
    xpAwardedPreview: row.xpAwardedPreview!,
    speedBonusAwarded: row.speedBonusAwarded!,
    feverActive: row.feverActive!,
    comboAfter: row.comboAfter!,
    isAttemptComplete: attempt.status === "completed",
    totalXpPreview: attempt.totalXpPreview,
  };
}

// One answer per question per attempt, idempotent (docs/ARCHITECTURE.md
// D21): if this step is already answered, the exact stored result is
// returned unchanged - no re-grading, no re-running the combo/XP math, no
// double-counting. Only the current served-and-unanswered step can be
// graded; an unserved step (no row at all) is rejected. Answer/explanation
// are revealed here, for this question only, never before this call and
// never for any other step.
//
// D22: grading always uses `row.servedRevision` - the revision that was
// actually SERVED to this learner (stamped once, at serve time) - never the
// live `questions` row. A hotfix landing between serve and answer changes
// nothing about this in-flight answer; it only affects the NEXT time this
// question is served.
export async function submitAnswer(
  user: { id: string },
  lessonId: string,
  stepIndex: number,
  rawAnswer: unknown,
  meta: RequestMeta,
) {
  const { lesson, questionIds } = await assertGradedLesson(lessonId);
  assertStepInRange(stepIndex, questionIds.length);

  const attempt = await getLatestInProgressAttempt(user.id, lessonId);
  if (!attempt) throw new AppError("CONFLICT", "No active attempt for this lesson - call serve first");

  const row = await getQuestionAnswer(attempt.id, stepIndex);
  if (!row) throw new AppError("CONFLICT", "This step hasn't been served yet");

  const servedRevision = await getQuestionRevision(row.questionId, row.servedRevision);
  if (!servedRevision) {
    // Should never happen once every publish/hotfix snapshots (D22) - a
    // data-integrity bug, not a normal "not found", but there's nothing
    // safe to grade against without it.
    throw new AppError("NOT_FOUND", "This question's served revision is no longer recoverable");
  }

  if (row.answeredAt) {
    return buildAnswerResponse(row, servedRevision, questionIds.length, attempt);
  }

  const question = await getQuestionById(row.questionId);
  if (!question) throw new AppError("NOT_FOUND", "This step's question no longer exists");

  const format = question.format as QuestionFormat;
  const answerResult = answerSchemaForFormat(format).safeParse(rawAnswer);
  if (!answerResult.success) {
    throw new AppError(
      "VALIDATION_FAILED",
      `Invalid answer for a "${format}" question: ${answerResult.error.issues
        .map((i) => `answer.${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }

  const settings = await getLessonFlowScoringSettings();
  const previous = await getPreviousQuestionAnswer(attempt.id, stepIndex);
  const comboBefore = previous?.isCorrect ? (previous.comboAfter ?? 0) : 0;
  const elapsedMs = Date.now() - row.servedAt.getTime();

  const score = computeScore({
    quizKind: quizKindForLesson(lesson.kind),
    answerMatches: answerMatches(format, answerResult.data, servedRevision.answer),
    elapsedMs,
    timerSeconds: row.timerSeconds,
    comboBefore,
    settings,
  });

  const answeredAt = new Date();
  let graded = await gradeQuestionAnswer({
    attemptId: attempt.id,
    stepIndex,
    submittedAnswer: answerResult.data,
    isCorrect: score.isCorrect,
    timedOut: score.timedOut,
    speedBonusAwarded: score.speedBonusAwarded,
    feverActive: score.feverActive,
    xpAwardedPreview: score.xpAwardedPreview,
    comboAfter: score.comboAfter,
    answeredAt,
  });
  if (!graded) {
    // Lost a genuine race against a concurrent duplicate submit for the
    // same step - the winner's stored result is the one true answer here,
    // same idempotent guarantee as the already-answered path above.
    const winner = await getQuestionAnswer(attempt.id, stepIndex);
    if (!winner?.answeredAt) throw new AppError("CONFLICT", "Could not grade this step - try again");
    graded = winner;
  }

  let attemptAfter = attempt;
  let isAttemptComplete = false;
  let totalXpPreview: number | null = null;
  if (stepIndex === questionIds.length) {
    const allAnswers = await listQuestionAnswersForAttempt(attempt.id);
    const sum = allAnswers.reduce((s, a) => s + (a.xpAwardedPreview ?? 0), 0);
    // D24 (docs/ARCHITECTURE.md): what a Boss Quiz's pass/fail is judged
    // against (src/server/worlds/service.ts's world-unlock check) - every
    // step is guaranteed answered by this point (stepIndex === the last
    // step, and every earlier step must already be answered to have
    // reached it), so allAnswers.length is always > 0 here.
    const accuracyPct = Math.round(
      (allAnswers.filter((a) => a.isCorrect).length / allAnswers.length) * 100,
    );
    const completed = await completeAttempt(attempt.id, sum, accuracyPct);
    if (completed) {
      attemptAfter = completed;
      isAttemptComplete = true;
      totalXpPreview = sum;
      // Feeds the world-unlock check (src/server/worlds/service.ts) and the
      // admin unpublish-warning (src/server/lessons/service.ts) - see
      // docs/ARCHITECTURE.md D23.
      await completeLessonProgress(user.id, lessonId);
      // docs/ECONOMY.md's per-lesson-kind "successful completion" rule
      // (docs/ARCHITECTURE.md D28): every kind that goes through this
      // graded-step flow has an accuracyPct, so every one of them needs a
      // pass mark to credit - completing-but-failing doesn't forfeit
      // anything, the learner just retries (a fresh attempt, same lesson
      // id, so the next PASS is still the one that credits - idempotency
      // is keyed on (user, lesson), never on a specific attempt). Boss
      // Quiz uses its own higher bar (D24, since it also gates world
      // unlock); Video/Quiz/Role Play share the lower lessonPassMarkPct.
      // Story/Doubt Zone never reach this code path at all (no graded
      // questions - Checkpoint 3's own completion endpoint handles them).
      const passMark =
        lesson.kind === "boss_quiz" ? settings.bossQuizPassMarkPct : settings.lessonPassMarkPct;
      const successful = accuracyPct >= passMark;
      await creditLessonCompletion(
        user,
        { id: lessonId, kind: lesson.kind, xpOverride: lesson.xpOverride, vmOverride: lesson.vmOverride },
        successful,
        meta,
      );
    } else {
      // Already completed by a concurrent duplicate last-step submit -
      // reflect the real, already-completed state rather than claiming
      // "not complete".
      const refreshed = await getAttemptById(attempt.id);
      if (refreshed) attemptAfter = refreshed;
      isAttemptComplete = attemptAfter.status === "completed";
      totalXpPreview = attemptAfter.totalXpPreview;
    }
  }

  await logActivity({
    actorType: "user",
    actorId: user.id,
    action: "quiz_attempt.step_answered",
    targetType: "quiz_attempt",
    targetId: attempt.id,
    metadata: {
      lessonId,
      stepIndex,
      isCorrect: score.isCorrect,
      xpAwardedPreview: score.xpAwardedPreview,
      attemptNumber: attempt.attemptNumber,
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  if (isAttemptComplete) {
    await logActivity({
      actorType: "user",
      actorId: user.id,
      action: "quiz_attempt.completed",
      targetType: "quiz_attempt",
      targetId: attempt.id,
      metadata: {
        lessonId,
        totalXpPreview,
        attemptNumber: attempt.attemptNumber,
        isFirstPass: attempt.isFirstPass,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  return buildAnswerResponse(graded, servedRevision, questionIds.length, attemptAfter);
}
