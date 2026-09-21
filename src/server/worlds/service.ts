import { logActivity } from "@/lib/activity-log";
import { isUniqueViolation } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import { imageContentType, imageExtension, MAX_IMAGE_BYTES, sniffImageType } from "@/lib/image";
import { getSignedDownloadUrl, uploadObject } from "@/lib/s3";
import { getMentorById, listAllMentors } from "@/server/mentors/repo";
import type { LocalizedText } from "@/server/shared/schemas";
import {
  getWorldById,
  insertDraftWorld,
  listAllWorlds,
  listPublishedWorlds,
  moveWorldToPosition,
  publishWorldRow,
  setWorldArtKey,
  unpublishWorldRow,
  updateDraftWorld,
} from "./repo";
import type { CreateWorldDraftInput, UpdateWorldDraftInput } from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;
type WorldRow = NonNullable<Awaited<ReturnType<typeof getWorldById>>>;

// Small, bounded set (7 worlds, a handful of mentors) - one query for all
// mentors and an in-memory map is simpler and cheaper than a join or N+1
// per-world lookups.
async function mentorKeyById(): Promise<Map<string, string>> {
  const mentors = await listAllMentors();
  return new Map(mentors.map((m) => [m.id, m.key]));
}

async function toPublicWorld(row: WorldRow, mentorKeysById: Map<string, string>) {
  return {
    order: row.order,
    title: row.title,
    tagline: row.tagline,
    theme: row.theme,
    displayXpTarget: row.displayXpTarget,
    artUrl: row.artKey ? await getSignedDownloadUrl(row.artKey) : null,
    mentorKey: mentorKeysById.get(row.mentorId) ?? "",
  };
}

export async function getPublicWorlds() {
  const [rows, keysById] = await Promise.all([listPublishedWorlds(), mentorKeyById()]);
  return Promise.all(rows.map((row) => toPublicWorld(row, keysById)));
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

  const moved = await moveWorldToPosition(id, newOrder);
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

export async function unpublishWorld(actor: { id: string }, id: string, meta: RequestMeta) {
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
