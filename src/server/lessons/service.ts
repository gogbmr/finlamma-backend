import { logActivity } from "@/lib/activity-log";
import { isUniqueViolation } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import { getWorldById, listPublishedWorlds } from "@/server/worlds/repo";
import { getQuestionsByIds } from "@/server/questions/repo";
import {
  countInProgressLearnersByLessonIds,
  getLessonProgressStatusesForUser,
} from "@/server/lesson-progress/repo";
import { getWorldIdsWithPassedBossQuiz } from "@/server/quiz-attempts/repo";
import { getLessonFlowScoringSettings } from "@/server/settings/service";
import { findMissingLocalizedText } from "@/server/shared/schemas";
import {
  getLessonById,
  getPublishedLesson,
  hotfixLessonRow,
  insertDraftLesson,
  listAllLessonsForWorld,
  listAllPublishedLessons,
  listPublishedLessonsForWorld,
  publishLessonRow,
  unpublishLessonRow,
  updateDraftLesson,
} from "./repo";
import { contentSchemaForKind, QuizLikeContentSchema, VideoContentSchema } from "./schemas";
import type {
  CreateLessonDraftInput,
  HotfixLessonInput,
  LessonKindCreate,
  LessonNodeState,
  UpdateLessonDraftInput,
} from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;
type LessonRow = NonNullable<Awaited<ReturnType<typeof getLessonById>>>;

function toSummary(row: LessonRow) {
  return {
    id: row.id,
    chapter: row.chapter,
    step: row.step,
    kind: row.kind,
    title: row.title,
    blurb: row.blurb,
  };
}

function toDetail(row: LessonRow) {
  return {
    id: row.id,
    worldId: row.worldId,
    chapter: row.chapter,
    step: row.step,
    kind: row.kind,
    title: row.title,
    blurb: row.blurb,
    content: row.content,
  };
}

// WH-12/D76 (docs/ARCHITECTURE.md): the SINGLE SOURCE OF TRUTH for a
// world's per-lesson state - both getPublicLessonsForWorld (the listing
// below) and assertLessonUnlocked (the serve/answer/complete enforcement
// gate every lesson-interaction endpoint calls) go through this exact
// function, so the journey-map UI and the gate can never disagree about
// which lessons are reachable. Returns every published lesson in the world
// alongside a lessonId -> state map.
//
// Same sequential-unlock rule as worlds/service.ts's getPublicWorlds and
// this file's own getCurrentLesson above - recomputed here for just this
// one world rather than calling getPublicWorlds, the same "duplicate the
// one-line rule, don't share a round trip" pattern getCurrentLesson already
// uses. A lesson can only ever be published while its world is (publishLesson
// below, and unpublishWorld blocks unpublishing while a published lesson
// still belongs to it), so a non-empty `rows` already guarantees worldId is
// a currently-published world - worldIndex === -1 is defensive only (e.g. a
// world unpublished in the instant between these two queries).
async function computeLessonStatesForWorld(
  worldId: string,
  userId: string,
): Promise<{ rows: LessonRow[]; states: Map<string, LessonNodeState> }> {
  const rows = await listPublishedLessonsForWorld(worldId);
  if (rows.length === 0) return { rows, states: new Map() };

  const publishedWorlds = await listPublishedWorlds();
  const worldIndex = publishedWorlds.findIndex((w) => w.id === worldId);
  const settings = await getLessonFlowScoringSettings();
  const clearedWorldIds = await getWorldIdsWithPassedBossQuiz(userId, settings.bossQuizPassMarkPct);
  const worldLocked =
    worldIndex === -1 || (worldIndex > 0 && !clearedWorldIds.has(publishedWorlds[worldIndex - 1]!.id));

  const states = new Map<string, LessonNodeState>();
  if (worldLocked) {
    for (const row of rows) states.set(row.id, "locked");
    return { rows, states };
  }

  const progressByLessonId = await getLessonProgressStatusesForUser(userId, rows.map((r) => r.id));
  let currentAssigned = false;
  for (const row of rows) {
    const status = progressByLessonId.get(row.id);
    if (status === "completed") {
      states.set(row.id, "done");
    } else if (!currentAssigned) {
      currentAssigned = true;
      states.set(row.id, "current");
    } else {
      states.set(row.id, "available");
    }
  }
  return { rows, states };
}

export async function getPublicLessonsForWorld(worldId: string, userId: string) {
  const { rows, states } = await computeLessonStatesForWorld(worldId, userId);
  return rows.map((row) => ({ ...toSummary(row), state: states.get(row.id)! }));
}

// D76 (docs/ARCHITECTURE.md): enforcement gate called by every lesson
// serve/answer/complete entry point (quiz-attempts' serveStep/submitAnswer,
// lesson-progress's serveUngradedLesson/completeUngradedLesson) BEFORE
// doing anything else, rejecting a "locked" node with LESSON_LOCKED (403).
// "current"/"available"/"done" (a replay) are all allowed - there is no
// lesson-to-lesson lock within an unlocked world (only within-lesson step
// ordering, D21), so this only ever actually blocks a lesson whose whole
// WORLD isn't unlocked yet. Takes the lesson row the caller already fetched
// (never re-fetches it) to avoid a duplicate round trip, and goes through
// the exact same computeLessonStatesForWorld the public listing above uses
// - never a separately-maintained copy of the lock rule.
export async function assertLessonUnlocked(
  lesson: { id: string; worldId: string },
  userId: string,
): Promise<void> {
  const { states } = await computeLessonStatesForWorld(lesson.worldId, userId);
  const state = states.get(lesson.id);
  if (state === undefined || state === "locked") {
    throw new AppError("LESSON_LOCKED", "This lesson isn't unlocked for you yet", {
      lessonId: lesson.id,
    });
  }
}

export async function getPublicLesson(id: string) {
  const row = await getPublishedLesson(id);
  if (!row) throw new AppError("NOT_FOUND", "No published lesson with this id");
  return toDetail(row);
}

// WH-06 "Resume" banner - progress-aware (phase-audit 2026-10-11 fix; this
// was previously a placeholder that always returned chapter 1/step 1 of
// the lowest-order world for every caller, regardless of actual progress).
// Walks published worlds in order, same sequential-unlock rule
// getPublicWorlds (src/server/worlds/service.ts) already uses: the first
// world is always reachable, every later one only once the previous
// world's Boss Quiz is passed. Within the first reachable world that still
// has an incomplete lesson, returns the first such lesson in chapter/step
// order - lesson_progress covers every lesson kind by this point
// (video/quiz/boss_quiz/role_play via quiz-attempts, story/doubt_zone via
// completeUngradedLessonProgressIfEligible, D23/D29), so no per-kind
// branching is needed here. If every reachable lesson is already
// completed, resumes into the last lesson of the last reachable world as a
// sensible terminal state rather than erroring.
export async function getCurrentLesson(userId: string) {
  const worlds = await listPublishedWorlds();
  if (worlds.length === 0) throw new AppError("NOT_FOUND", "No published worlds yet");

  const settings = await getLessonFlowScoringSettings();
  const clearedWorldIds = await getWorldIdsWithPassedBossQuiz(userId, settings.bossQuizPassMarkPct);

  let lastSeenLesson: LessonRow | null = null;

  for (let i = 0; i < worlds.length; i++) {
    const world = worlds[i]!;
    const locked = i > 0 && !clearedWorldIds.has(worlds[i - 1]!.id);
    if (locked) break; // this world, and every later one, isn't reachable yet

    const lessonsInWorld = await listPublishedLessonsForWorld(world.id);
    if (lessonsInWorld.length === 0) continue;
    lastSeenLesson = lessonsInWorld[lessonsInWorld.length - 1]!;

    const progressByLessonId = await getLessonProgressStatusesForUser(
      userId,
      lessonsInWorld.map((l) => l.id),
    );
    const next = lessonsInWorld.find((l) => progressByLessonId.get(l.id) !== "completed");
    if (next) return toDetail(next);
  }

  if (!lastSeenLesson) throw new AppError("NOT_FOUND", "No published lessons yet");
  return toDetail(lastSeenLesson);
}

// --- Staff (admin) ---

// Cross-field checks Zod's structural parse can't express on its own:
// every cue must fire within the video's length, and cues must be in
// non-decreasing timestamp order (matches how they'd actually fire during
// playback) - per the Phase 2b kickoff's content-editor requirements.
function validateVideoCueTiming(content: unknown): string[] {
  const parsed = VideoContentSchema.safeParse(content);
  if (!parsed.success) return []; // structural errors are reported separately
  const errors: string[] = [];
  const { cues, lengthSeconds } = parsed.data;
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i]!;
    if (cue.at > lengthSeconds) {
      errors.push(
        `content.cues[${i}].at (${cue.at}s) is after the video ends (${lengthSeconds}s)`,
      );
    }
    if (i > 0 && cue.at < cues[i - 1]!.at) {
      errors.push(`content.cues[${i}].at (${cue.at}s) is out of order - cues must be sorted by timestamp`);
    }
  }
  return errors;
}

// Publish is blocked until every en/hi/hx leaf (title, blurb, and every
// LocalizedText leaf inside content, however deeply nested) is filled, and
// - for video - cues are in order and within the video length. Errors name
// the exact field/cue, same "name it, don't just say invalid" pattern as
// src/server/mentors/service.ts and src/server/worlds/service.ts.
function validateLessonForPublish(lesson: LessonRow): void {
  const missingFields = [
    ...findMissingLocalizedText(lesson.title, "title"),
    ...findMissingLocalizedText(lesson.blurb, "blurb"),
    ...findMissingLocalizedText(lesson.content, "content"),
  ];
  const structuralErrors = lesson.kind === "video" ? validateVideoCueTiming(lesson.content) : [];

  if (missingFields.length === 0 && structuralErrors.length === 0) return;

  const parts = [
    ...missingFields.map((f) => `missing translation for ${f}`),
    ...structuralErrors,
  ];
  throw new AppError(
    "VALIDATION_FAILED",
    `Cannot publish: ${parts.join("; ")}`,
    { missingFields, structuralErrors },
  );
}

// Which question ids a lesson's content references, by kind - video's
// in-video pop-quiz cues, or a quiz/boss_quiz/role_play's question list.
// Story and doubt_zone never reference a question at all. See
// docs/ARCHITECTURE.md D18. Exported for src/server/quiz-attempts/service.ts
// (Checkpoint 5b), which needs the same ordered id list to map a lesson's
// step index to a question.
export function extractQuestionIds(kind: string, content: unknown): string[] {
  if (kind === "video") {
    const parsed = VideoContentSchema.safeParse(content);
    return parsed.success ? parsed.data.cues.map((c) => c.questionId) : [];
  }
  if (kind === "quiz" || kind === "boss_quiz" || kind === "role_play") {
    const parsed = QuizLikeContentSchema.safeParse(content);
    return parsed.success ? parsed.data.questionIds : [];
  }
  return [];
}

// Every question id `content` references must exist and be published -
// shared by publishLesson (D18) and hotfixLesson (D20/D23), since a hotfix
// can change `content` just as freely as a draft edit can. Named
// per-reference, same "name it" pattern as every other gate here.
async function assertQuestionReferencesValid(kind: string, content: unknown): Promise<void> {
  const questionIds = extractQuestionIds(kind, content);
  if (questionIds.length === 0) return;

  const found = await getQuestionsByIds(questionIds);
  const foundById = new Map(found.map((q) => [q.id, q]));
  const questionProblems: string[] = [];
  for (const qid of questionIds) {
    const q = foundById.get(qid);
    if (!q) questionProblems.push(`question ${qid} does not exist`);
    else if (q.status !== "published") questionProblems.push(`question ${qid} is not published`);
  }
  if (questionProblems.length > 0) {
    throw new AppError("VALIDATION_FAILED", `Cannot publish: ${questionProblems.join("; ")}`, {
      questionProblems,
    });
  }
}

// D23 (docs/ARCHITECTURE.md): staff-facing lesson list for a world,
// including how many learners are currently mid-lesson (lesson_progress
// status "in_progress") on each - the admin editor uses this to warn
// before an unpublish, the same "computed from data already loaded, no
// dedicated warning endpoint" pattern as D19's mentor-change warning.
export async function getLessonEditorData(worldId: string) {
  const rows = await listAllLessonsForWorld(worldId);
  const countsByLessonId = await countInProgressLearnersByLessonIds(rows.map((r) => r.id));
  return rows.map((row) => ({
    ...row,
    inProgressLearnerCount: countsByLessonId.get(row.id) ?? 0,
  }));
}

// Used by questions/service.ts's unpublishQuestion to block unpublishing a
// question that a published lesson still references - the reverse of D18's
// publish-time check, same pattern as mentors<->worlds and worlds<->lessons.
// Scans every published lesson's content (question ids are jsonb, not a
// relational column, so there's no WHERE clause that can do this in SQL) -
// worlds/lessons are staff-created with no fixed count (D25,
// docs/ARCHITECTURE.md), but the total stays small enough in practice for
// this full-table scan to remain cheap.
export async function listPublishedLessonsReferencingQuestion(questionId: string) {
  const lessons = await listAllPublishedLessons();
  return lessons.filter((l) => extractQuestionIds(l.kind, l.content).includes(questionId));
}

// Staff-only (see the admin Server Action's permission gate, not this
// function). Works on a lesson of ANY status - that's the whole point, so a
// draft can be previewed before publishing - but calls the exact same
// toDetail() projection getPublicLesson uses, so what staff see in preview
// can never structurally drift from what the app actually receives once
// published. The caller adds the en/hi/hx toggle on top client-side; this
// always returns every language, same as the app's own response.
export async function getLessonPreview(id: string) {
  const row = await getLessonById(id);
  if (!row) throw new AppError("NOT_FOUND", "Lesson not found");
  return toDetail(row);
}

async function assertWorldExists(worldId: string): Promise<void> {
  const world = await getWorldById(worldId);
  if (!world) throw new AppError("NOT_FOUND", "World not found");
}

export async function createLessonDraft(
  actor: { id: string },
  input: CreateLessonDraftInput,
  meta: RequestMeta,
) {
  await assertWorldExists(input.worldId);

  let created;
  try {
    created = await insertDraftLesson(input);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(
        "CONFLICT",
        `Chapter ${input.chapter}, step ${input.step} is already in use in this world`,
      );
    }
    throw err;
  }
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "lesson.created",
    targetType: "lesson",
    targetId: created.id,
    metadata: { title: created.title.en, chapter: created.chapter, step: created.step },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return created;
}

// content's structural shape is re-validated here against the *existing*
// lesson's kind (immutable, not part of the input - see
// UpdateLessonDraftSchema) since a Zod schema alone can't know which
// content shape applies without first reading the row.
export async function updateLessonDraft(
  actor: { id: string },
  input: UpdateLessonDraftInput,
  meta: RequestMeta,
) {
  const existing = await getLessonById(input.id);
  if (!existing) throw new AppError("NOT_FOUND", "Lesson not found");

  const contentResult = contentSchemaForKind(existing.kind as LessonKindCreate).safeParse(
    input.content,
  );
  if (!contentResult.success) {
    throw new AppError(
      "VALIDATION_FAILED",
      `Invalid content for a "${existing.kind}" lesson: ${contentResult.error.issues
        .map((i) => `content.${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }

  let updated;
  try {
    updated = await updateDraftLesson(input);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(
        "CONFLICT",
        `Chapter ${input.chapter}, step ${input.step} is already in use in this world`,
      );
    }
    throw err;
  }
  if (!updated) {
    throw new AppError(
      "CONFLICT",
      "Lesson not found, or it's currently published - unpublish it first to edit",
    );
  }
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "lesson.draft_saved",
    targetType: "lesson",
    targetId: updated.id,
    metadata: { title: updated.title.en, chapter: updated.chapter, step: updated.step },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

export async function publishLesson(actor: { id: string }, id: string, meta: RequestMeta) {
  const lesson = await getLessonById(id);
  if (!lesson) throw new AppError("NOT_FOUND", "Lesson not found");
  if (lesson.status !== "draft") {
    throw new AppError("CONFLICT", "Lesson is not a draft");
  }
  validateLessonForPublish(lesson);

  // D18: every question id this lesson's content references must exist and
  // be published - closes the gap Checkpoint 4 deliberately left open
  // (the questions table didn't exist yet, so only UUID *shape* could be
  // checked then).
  await assertQuestionReferencesValid(lesson.kind, lesson.content);

  // Publishing a lesson requires its world to already be published - a
  // learner can't reach a lesson through a world that doesn't exist to them
  // yet, per the Phase 2b Checkpoint 4a kickoff discussion (mirrors the
  // mentor<->world publish dependency from Checkpoint 3).
  const world = await getWorldById(lesson.worldId);
  if (!world) throw new AppError("NOT_FOUND", "World not found");
  if (world.status !== "published") {
    throw new AppError(
      "CONFLICT",
      `Cannot publish: world "${world.title.en}" is not published yet`,
    );
  }

  const published = await publishLessonRow(id, actor.id);
  if (!published) throw new AppError("CONFLICT", "Lesson is not a draft");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "lesson.published",
    targetType: "lesson",
    targetId: published.id,
    metadata: { title: published.title.en, worldTitle: world.title.en },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return published;
}

// D23 (docs/ARCHITECTURE.md): a Boss Quiz lesson can never be unpublished,
// full stop - it's a world's sequential-unlock gate (worlds/service.ts's
// getPublicWorlds), so pulling it would both 404 any learner mid-attempt
// AND strand every world after it, un-clearable, for every learner who
// hasn't reached it yet. This is a hard block, unlike every other lesson
// (see the in-progress-learner count on getLessonEditorData above, which is
// a soft warning the admin UI surfaces before unpublishing those). Fixing a
// boss_quiz lesson's content now goes through hotfixLesson below instead.
export async function unpublishLesson(actor: { id: string }, id: string, meta: RequestMeta) {
  const lesson = await getLessonById(id);
  if (!lesson) throw new AppError("NOT_FOUND", "Lesson not found");
  if (lesson.kind === "boss_quiz") {
    throw new AppError(
      "CONFLICT",
      "Cannot unpublish: this is a world's Boss Quiz - it gates every later world's unlock. " +
        "Use Save fix to edit it instead.",
    );
  }

  const unpublished = await unpublishLessonRow(id);
  if (!unpublished) throw new AppError("CONFLICT", "Lesson not found, or it's not published");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "lesson.unpublished",
    targetType: "lesson",
    targetId: unpublished.id,
    metadata: { title: unpublished.title.en },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return unpublished;
}

// D20/D23 (docs/ARCHITECTURE.md): direct edit of an already-PUBLISHED
// lesson's title/blurb/content, without unpublishing - the only fix path
// left for a boss_quiz lesson (unpublish is hard-blocked above), and a
// lower-disruption option for any other lesson with learners mid-lesson.
// Requires lesson.publish (not just lesson.manage), same trust bar as
// publishing. Re-runs every check publish itself would: content shape
// against the lesson's own immutable kind, translation completeness,
// video cue timing, and D18's question-reference check.
export async function hotfixLesson(
  actor: { id: string },
  input: HotfixLessonInput,
  meta: RequestMeta,
) {
  const existing = await getLessonById(input.id);
  if (!existing) throw new AppError("NOT_FOUND", "Lesson not found");
  if (existing.status !== "published") {
    throw new AppError("CONFLICT", "Lesson is not published - edit its draft instead");
  }

  const contentResult = contentSchemaForKind(existing.kind as LessonKindCreate).safeParse(
    input.content,
  );
  if (!contentResult.success) {
    throw new AppError(
      "VALIDATION_FAILED",
      `Invalid content for a "${existing.kind}" lesson: ${contentResult.error.issues
        .map((i) => `content.${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }

  validateLessonForPublish({ ...existing, ...input });
  await assertQuestionReferencesValid(existing.kind, input.content);

  const updated = await hotfixLessonRow(input);
  if (!updated) throw new AppError("CONFLICT", "Lesson is not published - edit its draft instead");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "lesson.hotfixed",
    targetType: "lesson",
    targetId: updated.id,
    metadata: { title: updated.title.en, kind: updated.kind },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}
