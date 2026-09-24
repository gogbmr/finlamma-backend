import { logActivity } from "@/lib/activity-log";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import { logInternalError } from "@/lib/http";
import { evaluateBadgesForUser } from "@/server/badges/service";
import { creditLessonCompletion } from "@/server/economy/service";
import { getPublishedLesson } from "@/server/lessons/repo";
import { getLessonFlowScoringSettings } from "@/server/settings/service";
import {
  completeUngradedLessonProgressIfEligible,
  getLessonProgress,
  startLessonProgress,
} from "./repo";

type RequestMeta = ReturnType<typeof requestMeta>;

const UNGRADED_KINDS = new Set(["story", "doubt_zone"]);

async function assertUngradedLesson(lessonId: string) {
  const lesson = await getPublishedLesson(lessonId);
  if (!lesson) throw new AppError("NOT_FOUND", "No published lesson with this id");
  if (!UNGRADED_KINDS.has(lesson.kind)) {
    throw new AppError(
      "VALIDATION_FAILED",
      `"${lesson.kind}" lessons use POST /lessons/{id}/steps/{n}/serve, not this endpoint`,
    );
  }
  return lesson;
}

function minCompletionSecondsFor(
  kind: string,
  settings: { storyMinCompletionSeconds: number; doubtZoneMinCompletionSeconds: number },
): number {
  return kind === "story" ? settings.storyMinCompletionSeconds : settings.doubtZoneMinCompletionSeconds;
}

// Story/Doubt Zone's own "serve" (Phase 3 Checkpoint 3, closing D23's known
// gap): stamps the server-side `startedAt` anchor .../complete measures
// elapsed time from - never trusted from the client, same anti-cheat
// reasoning as D21's graded-step serveStep. Idempotent: re-serving an
// already-served (or already-completed) lesson returns the exact original
// startedAt, never a new one.
export async function serveUngradedLesson(user: { id: string }, lessonId: string, meta: RequestMeta) {
  const lesson = await assertUngradedLesson(lessonId);

  const inserted = await startLessonProgress(user.id, lessonId);
  const row = inserted ?? (await getLessonProgress(user.id, lessonId));
  if (!row) throw new AppError("INTERNAL", "Could not start this lesson");

  if (inserted) {
    await logActivity({
      actorType: "user",
      actorId: user.id,
      action: "lesson_progress.served",
      targetType: "lesson",
      targetId: lessonId,
      metadata: { kind: lesson.kind },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  return { lessonId, status: row.status, startedAt: row.startedAt.toISOString() };
}

// Story/Doubt Zone's own "complete" (Phase 3 Checkpoint 3). Anti-farming
// rules (agreed before building): must have been served first (a
// lesson_progress row must exist), at least the kind's own
// settings_kv.lesson_flow_scoring.*MinCompletionSeconds must have elapsed
// since that server-stamped startedAt, and it credits at most once per
// user per lesson - a later call on an already-completed lesson is a
// no-op idempotent replay (credited: false), never a second credit
// (docs/DATA_MODEL.md, docs/ARCHITECTURE.md D26's (user, lesson) key
// already guarantees this at the ledger level; this function additionally
// never re-attempts the credit call at all once completed, since there's
// nothing left to decide).
export async function completeUngradedLesson(user: { id: string }, lessonId: string, meta: RequestMeta) {
  const lesson = await assertUngradedLesson(lessonId);

  const existing = await getLessonProgress(user.id, lessonId);
  if (!existing) {
    throw new AppError("CONFLICT", "Not served yet - call POST /lessons/{id}/serve first");
  }
  if (existing.status === "completed") {
    return {
      lessonId,
      status: "completed" as const,
      completedAt: existing.completedAt!.toISOString(),
      credited: false,
    };
  }

  const settings = await getLessonFlowScoringSettings();
  const minSeconds = minCompletionSecondsFor(lesson.kind, settings);
  const minStartedAt = new Date(Date.now() - minSeconds * 1000);

  const completed = await completeUngradedLessonProgressIfEligible(user.id, lessonId, minStartedAt);
  if (!completed) {
    // Either genuinely too soon, or a concurrent duplicate request already
    // completed it in the meantime - re-read to tell the two apart rather
    // than assume.
    const refreshed = await getLessonProgress(user.id, lessonId);
    if (refreshed?.status === "completed") {
      return {
        lessonId,
        status: "completed" as const,
        completedAt: refreshed.completedAt!.toISOString(),
        credited: false,
      };
    }
    const startedAt = (refreshed ?? existing).startedAt;
    const secondsElapsed = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
    throw new AppError(
      "LESSON_TOO_SOON",
      `Spend a bit more time here before completing (${minSeconds}s minimum, ${secondsElapsed}s so far)`,
      { minSeconds, secondsElapsed },
    );
  }

  await logActivity({
    actorType: "user",
    actorId: user.id,
    action: "lesson_progress.completed",
    targetType: "lesson",
    targetId: lessonId,
    metadata: { kind: lesson.kind },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  // Story/Doubt Zone have no accuracy concept at all (D23/D28) - reaching
  // this point (served, minimum time elapsed) already IS "successful".
  const { credited } = await creditLessonCompletion(
    user,
    { id: lessonId, kind: lesson.kind, xpOverride: lesson.xpOverride, vmOverride: lesson.vmOverride },
    true,
    meta,
  );
  // Badges: same best-effort/isolated reasoning as
  // src/server/quiz-attempts/service.ts's identical hook - a badge-
  // evaluation failure must never surface as a failed lesson-completion
  // response, and evaluateBadgesForUser is itself idempotent.
  if (credited) {
    try {
      await evaluateBadgesForUser(user, meta);
    } catch (err) {
      logInternalError("badges.evaluate_failed", err);
    }
  }

  return {
    lessonId,
    status: "completed" as const,
    completedAt: completed.completedAt!.toISOString(),
    credited: true,
  };
}
