import { logActivity } from "@/lib/activity-log";
import { isForeignKeyViolation, isTransactionConflict, isUniqueViolation } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import { imageContentType, imageExtension, MAX_IMAGE_BYTES, sniffImageType } from "@/lib/image";
import { getSignedDownloadUrl, uploadObject } from "@/lib/s3";
import { getMentorById, listAllMentors } from "@/server/mentors/repo";
import {
  hasBossQuizLesson,
  listAllLessonsForWorld,
  listPublishedLessonsByWorldId,
} from "@/server/lessons/repo";
import { getWorldIdsWithPassedBossQuiz } from "@/server/quiz-attempts/repo";
import { getLessonFlowScoringSettings } from "@/server/settings/service";
import type { LocalizedText } from "@/server/shared/schemas";
import {
  deleteWorldRow,
  getWorldById,
  hotfixWorldRow,
  insertDraftWorld,
  listAllWorlds,
  listPublishedWorlds,
  moveWorldToPosition,
  publishWorldRow,
  setWorldArtKey,
  unpublishWorldRow,
  updateDraftWorld,
  WorldOrderConflictError,
} from "./repo";
import type { CreateWorldDraftInput, HotfixWorldInput, UpdateWorldDraftInput } from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;
type WorldRow = NonNullable<Awaited<ReturnType<typeof getWorldById>>>;

// Staff decide how many worlds/mentors exist (D25, docs/ARCHITECTURE.md) -
// this is a small dataset in practice, not a hard cap, so one query for all
// mentors and an in-memory map is simpler and cheaper than a join or N+1
// per-world lookups; it stays cheap even at dozens of worlds/mentors.
async function mentorKeyById(): Promise<Map<string, string>> {
  const mentors = await listAllMentors();
  return new Map(mentors.map((m) => [m.id, m.key]));
}

async function toPublicWorld(row: WorldRow, mentorKeysById: Map<string, string>, locked: boolean) {
  return {
    order: row.order,
    title: row.title,
    tagline: row.tagline,
    theme: row.theme,
    displayXpTarget: row.displayXpTarget,
    artUrl: row.artKey ? await getSignedDownloadUrl(row.artKey) : null,
    mentorKey: mentorKeysById.get(row.mentorId) ?? "",
    locked,
  };
}

// Sequential unlock only (PRODUCT_SPEC.md §1, docs/ARCHITECTURE.md D23/D24):
// the first (lowest-order) published world is always unlocked; every other
// world is unlocked once the PREVIOUS world's Boss Quiz has been PASSED
// (accuracyPct >= the admin-editable bossQuizPassMarkPct, D24) by this user
// - never an XP/level gate, and never based on displayXpTarget (that field
// is a cosmetic progress indicator only, per the worlds table's own
// comment). Worlds are already ordered ascending by `order`
// (listPublishedWorlds), so "previous" is simply the prior element.
export async function getPublicWorlds(userId: string) {
  const settings = await getLessonFlowScoringSettings();
  const [rows, keysById, clearedWorldIds] = await Promise.all([
    listPublishedWorlds(),
    mentorKeyById(),
    getWorldIdsWithPassedBossQuiz(userId, settings.bossQuizPassMarkPct),
  ]);
  return Promise.all(
    rows.map((row, i) => {
      const locked = i > 0 && !clearedWorldIds.has(rows[i - 1]!.id);
      return toPublicWorld(row, keysById, locked);
    }),
  );
}

// --- Staff (admin) ---

// Publish is blocked until every trilingual text leaf has en/hi/hx all
// filled (non-empty after trimming) - errors name the exact field, same
// pattern as src/server/mentors/service.ts's validateMentorForPublish.
function validateWorldForPublish(world: WorldRow): void {
  const missing: string[] = [];
  const checkLocalized = (fieldName: string, value: LocalizedText) => {
    for (const lang of ["en", "hi", "hx"] as const) {
      if (!value[lang]?.trim()) missing.push(`${fieldName}.${lang}`);
    }
  };
  checkLocalized("title", world.title);
  checkLocalized("tagline", world.tagline);

  if (missing.length > 0) {
    throw new AppError(
      "VALIDATION_FAILED",
      `Cannot publish: missing translation${missing.length > 1 ? "s" : ""} for ${missing.join(", ")}`,
      { missingFields: missing },
    );
  }
}

export async function getWorldEditorData() {
  const rows = await listAllWorlds();
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      artUrl: row.artKey ? await getSignedDownloadUrl(row.artKey) : null,
    })),
  );
}

async function assertMentorExists(mentorId: string): Promise<void> {
  const mentor = await getMentorById(mentorId);
  if (!mentor) throw new AppError("NOT_FOUND", "Mentor not found");
}

export async function createWorldDraft(
  actor: { id: string },
  input: CreateWorldDraftInput,
  meta: RequestMeta,
) {
  await assertMentorExists(input.mentorId);

  let created;
  try {
    created = await insertDraftWorld(input);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("CONFLICT", `Order ${input.order} is already in use by another world`);
    }
    throw err;
  }
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "world.created",
    targetType: "world",
    targetId: created.id,
    metadata: { title: created.title.en, order: created.order },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return created;
}

export async function updateWorldDraft(
  actor: { id: string },
  input: UpdateWorldDraftInput,
  meta: RequestMeta,
) {
  await assertMentorExists(input.mentorId);

  let updated;
  try {
    updated = await updateDraftWorld(input);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("CONFLICT", `Order ${input.order} is already in use by another world`);
    }
    throw err;
  }
  if (!updated) {
    throw new AppError(
      "CONFLICT",
      "World not found, or it's currently published - unpublish it first to edit",
    );
  }
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "world.draft_saved",
    targetType: "world",
    targetId: updated.id,
    metadata: { title: updated.title.en, order: updated.order },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

// A real reorder (swap two worlds, move one to a new position) - see
// moveWorldToPosition in repo.ts for how it stays safe under the unique
// order index. Deliberately not draft-gated like updateWorldDraft: order is
// a structural sequencing property, not reviewed content, so staff can
// reorder published worlds too (e.g. re-prioritizing after launch) without
// an unpublish/republish cycle.
export async function reorderWorld(
  actor: { id: string },
  id: string,
  newOrder: number,
  meta: RequestMeta,
) {
  const worldCount = (await listAllWorlds()).length;
  if (newOrder < 1 || newOrder > worldCount) {
    throw new AppError(
      "VALIDATION_FAILED",
      `newOrder must be between 1 and ${worldCount} (the current number of worlds)`,
    );
  }

  // moveWorldToPosition can lose a genuine concurrent race against another
  // reorder touching an overlapping set of worlds - Postgres detects that
  // itself (serialization failure or deadlock) and aborts the losing
  // transaction, which also guarantees it never leaves a sentinel order
  // value behind (the abort rolls back everything the transaction wrote,
  // not just the final values - see repo.test.ts's rollback-safety test).
  // Mapped to a clean, retryable CONFLICT here rather than surfacing as a
  // raw 500.
  let moved;
  try {
    moved = await moveWorldToPosition(id, newOrder);
  } catch (err) {
    if (isTransactionConflict(err)) {
      throw new AppError(
        "CONFLICT",
        "Another reorder was happening at the same time - try again",
      );
    }
    throw err;
  }
  if (!moved) throw new AppError("NOT_FOUND", "World not found");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "world.reordered",
    targetType: "world",
    targetId: moved.id,
    metadata: { title: moved.title.en, newOrder },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return moved;
}

export async function uploadWorldArt(
  actor: { id: string },
  id: string,
  file: { body: Buffer },
  meta: RequestMeta,
) {
  const world = await getWorldById(id);
  if (!world) throw new AppError("NOT_FOUND", "World not found");

  if (file.body.byteLength > MAX_IMAGE_BYTES) {
    throw new AppError("VALIDATION_FAILED", "Art must be 2MB or smaller");
  }

  // Never trusts a client-supplied Content-Type or filename extension - see
  // src/lib/image.ts and src/server/mentors/service.ts's uploadMentorArt,
  // which this mirrors exactly.
  const detectedType = sniffImageType(file.body);
  if (!detectedType) {
    throw new AppError("VALIDATION_FAILED", "Art must be a valid PNG, JPEG or WebP image");
  }

  const artKey = `worlds/${id}/art.${imageExtension(detectedType)}`;
  await uploadObject(artKey, file.body, imageContentType(detectedType));
  const updated = await setWorldArtKey(id, artKey);
  if (!updated) throw new AppError("NOT_FOUND", "World not found");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "world.art_uploaded",
    targetType: "world",
    targetId: id,
    metadata: { title: world.title.en },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

export async function publishWorld(actor: { id: string }, id: string, meta: RequestMeta) {
  const world = await getWorldById(id);
  if (!world) throw new AppError("NOT_FOUND", "World not found");
  if (world.status !== "draft") {
    throw new AppError("CONFLICT", "World is not a draft");
  }
  validateWorldForPublish(world);

  // D24 (docs/ARCHITECTURE.md): a world needs at least a DRAFT boss_quiz
  // lesson before it can publish - the lesson itself can't be published
  // until AFTER its world is (see publishLesson's own world-published
  // check), so requiring a published one here would be impossible. Staff
  // publish the boss_quiz lesson right after the world. Applies going
  // forward only - it's checked here at publish time, never retroactively
  // against a world that's already published (see GET /api/v1/health's
  // worldsMissingBossQuiz for those).
  if (!(await hasBossQuizLesson(id))) {
    throw new AppError(
      "CONFLICT",
      "Cannot publish: this world has no Boss Quiz lesson yet (a draft is enough) - " +
        "create one before publishing the world",
    );
  }

  // Publishing a world requires its mentor to already be published - a
  // learner reaching this world must always have a real mentor to meet, per
  // the Phase 2b Checkpoint 3 kickoff discussion.
  const mentor = await getMentorById(world.mentorId);
  if (!mentor) throw new AppError("NOT_FOUND", "Mentor not found");
  if (mentor.status !== "published") {
    throw new AppError(
      "CONFLICT",
      `Cannot publish: mentor "${mentor.name.en || mentor.key}" is not published yet`,
    );
  }

  const published = await publishWorldRow(id, actor.id);
  if (!published) throw new AppError("CONFLICT", "World is not a draft");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "world.published",
    targetType: "world",
    targetId: published.id,
    metadata: { title: published.title.en, mentorKey: mentor.key },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return published;
}

// D20 (docs/ARCHITECTURE.md): fixes a typo on an already-PUBLISHED world's
// title/tagline directly, without the unpublish -> edit draft -> republish
// cycle - which is impossible here anyway once any published lesson belongs
// to the world (unpublishWorld above blocks it). Requires world.publish
// (not just world.manage), same trust bar as publishing. Re-runs the same
// translation-completeness gate publish itself uses.
export async function hotfixWorld(
  actor: { id: string },
  input: HotfixWorldInput,
  meta: RequestMeta,
) {
  const existing = await getWorldById(input.id);
  if (!existing) throw new AppError("NOT_FOUND", "World not found");
  if (existing.status !== "published") {
    throw new AppError("CONFLICT", "World is not published - edit its draft instead");
  }

  validateWorldForPublish({ ...existing, ...input });

  const updated = await hotfixWorldRow(input);
  if (!updated) throw new AppError("CONFLICT", "World is not published - edit its draft instead");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "world.hotfixed",
    targetType: "world",
    targetId: updated.id,
    metadata: { title: updated.title.en },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

export async function unpublishWorld(actor: { id: string }, id: string, meta: RequestMeta) {
  // Blocked while any published lesson still belongs to this world - same
  // reasoning and pattern as mentors/service.ts's unpublishMentor being
  // blocked by a published world: checked before the unpublish itself, not
  // a post-hoc rollback.
  const referencingLessons = await listPublishedLessonsByWorldId(id);
  if (referencingLessons.length > 0) {
    const labels = referencingLessons
      .map((l) => `${l.title.en} (ch${l.chapter}/step${l.step})`)
      .join(", ");
    throw new AppError(
      "CONFLICT",
      `Cannot unpublish: still has published lesson(s): ${labels}`,
      { lessonIds: referencingLessons.map((l) => l.id) },
    );
  }

  const unpublished = await unpublishWorldRow(id);
  if (!unpublished) throw new AppError("CONFLICT", "World not found, or it's not published");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "world.unpublished",
    targetType: "world",
    targetId: unpublished.id,
    metadata: { title: unpublished.title.en },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return unpublished;
}

// D25 (docs/ARCHITECTURE.md): a world can be permanently removed only while
// it has zero lessons (any status - draft or published). This is the only
// check needed: lesson_progress rows are keyed off a lesson, so a world
// with no lessons structurally cannot have any learner progress either.
// Draft or published worlds can both be deleted under this rule (a
// published world with no lessons is empty, not "live" in any meaningful
// sense) - deleteWorldRow itself closes the resulting gap in `order` so
// sequencing stays contiguous for the sequential-unlock rule. Gated on
// world.publish (not world.manage) in the action layer, the same trust bar
// as unpublishing - deletion is a stronger, irreversible action, so it
// shouldn't be reachable by a role that isn't even trusted to unpublish.
export async function deleteWorld(actor: { id: string }, id: string, meta: RequestMeta) {
  const world = await getWorldById(id);
  if (!world) throw new AppError("NOT_FOUND", "World not found");

  const lessons = await listAllLessonsForWorld(id);
  if (lessons.length > 0) {
    throw new AppError(
      "CONFLICT",
      `Cannot delete: this world still has ${lessons.length} lesson(s) - delete or move them first`,
      { lessonIds: lessons.map((l) => l.id) },
    );
  }

  // The lesson-count check above isn't in the same transaction as the
  // delete itself, so a lesson created for this world in the gap between
  // them (lessons.worldId is onDelete: "restrict") makes the delete fail
  // as a foreign-key violation instead - mapped here to the same kind of
  // clean, retryable CONFLICT rather than a raw 500. A genuinely concurrent
  // write to the order sequence itself (another delete, a reorder) is a
  // separate failure mode, mapped from WorldOrderConflictError below.
  let deleted;
  try {
    deleted = await deleteWorldRow(id);
  } catch (err) {
    if (err instanceof WorldOrderConflictError) {
      throw new AppError(
        "CONFLICT",
        "Another change to the world order was happening at the same time - try again",
      );
    }
    if (isForeignKeyViolation(err)) {
      throw new AppError(
        "CONFLICT",
        "Cannot delete: a lesson was just added to this world - delete or move it first",
      );
    }
    throw err;
  }
  if (!deleted) throw new AppError("NOT_FOUND", "World not found");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "world.deleted",
    targetType: "world",
    targetId: id,
    metadata: { title: world.title.en, order: world.order },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return deleted;
}

// D25 (docs/ARCHITECTURE.md): trading unlocks once the learner has passed
// the Boss Quiz of the world at settings_kv position
// `tradingUnlockAfterWorldPosition` (default 3, super_admin-editable) -
// position in the published, ordered world list, never a specific world id
// or name, so trading's unlock point moves automatically if worlds are
// added, removed or reordered ahead of it. Not consumed by any endpoint
// yet (that's Phase 4's trading domain); exported now so Phase 4 can import
// it directly instead of re-deriving this rule. If fewer published worlds
// exist than the configured position, trading stays locked for everyone -
// see GET /api/v1/health's tradingUnlockWorldMissing warning for the
// content-completeness side of this.
export async function isTradingUnlocked(userId: string): Promise<boolean> {
  const settings = await getLessonFlowScoringSettings();
  const position = settings.tradingUnlockAfterWorldPosition;

  const publishedWorlds = await listPublishedWorlds();
  if (publishedWorlds.length < position) return false;

  const targetWorld = publishedWorlds[position - 1]!;
  const clearedWorldIds = await getWorldIdsWithPassedBossQuiz(userId, settings.bossQuizPassMarkPct);
  return clearedWorldIds.has(targetWorld.id);
}
