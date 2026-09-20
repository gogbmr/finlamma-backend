import { logActivity } from "@/lib/activity-log";
import { isUniqueViolation } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import { getSignedDownloadUrl, uploadObject } from "@/lib/s3";
import {
  getMentorById,
  getPublishedMentorByKey,
  insertDraftMentor,
  listAllMentors,
  listPublishedMentors,
  publishMentorRow,
  setMentorArtKey,
  unpublishMentorRow,
  updateDraftMentor,
} from "./repo";
import type {
  CreateMentorDraftInput,
  LocalizedText,
  UpdateMentorDraftInput,
} from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;
type MentorRow = NonNullable<Awaited<ReturnType<typeof getMentorById>>>;

async function toPublicMentor(row: MentorRow) {
  return {
    key: row.key,
    order: row.order,
    name: row.name,
    bio: row.bio,
    worldRangeStart: row.worldRangeStart,
    worldRangeEnd: row.worldRangeEnd,
    artUrl: row.artKey ? await getSignedDownloadUrl(row.artKey) : null,
  };
}

export async function getPublicMentors() {
  const rows = await listPublishedMentors();
  return Promise.all(rows.map(toPublicMentor));
}

export async function getPublicMentorByKey(key: string) {
  const row = await getPublishedMentorByKey(key);
  if (!row) throw new AppError("NOT_FOUND", `No published mentor with key "${key}"`);
  return toPublicMentor(row);
}

// --- Staff (admin) ---

// Publish is blocked until every trilingual text leaf has en/hi/hx all
// filled (non-empty after trimming) - errors name the exact field so the
// admin editor can point at it directly, per Phase 2b kickoff's decision.
function validateMentorForPublish(mentor: MentorRow): void {
  const missing: string[] = [];
  const checkLocalized = (fieldName: string, value: LocalizedText) => {
    for (const lang of ["en", "hi", "hx"] as const) {
      if (!value[lang]?.trim()) missing.push(`${fieldName}.${lang}`);
    }
  };
  checkLocalized("name", mentor.name);
  checkLocalized("bio", mentor.bio);

  if (missing.length > 0) {
    throw new AppError(
      "VALIDATION_FAILED",
      `Cannot publish: missing translation${missing.length > 1 ? "s" : ""} for ${missing.join(", ")}`,
      { missingFields: missing },
    );
  }
}

export async function getMentorEditorData() {
  const rows = await listAllMentors();
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      artUrl: row.artKey ? await getSignedDownloadUrl(row.artKey) : null,
    })),
  );
}

export async function createMentorDraft(
  actor: { id: string },
  input: CreateMentorDraftInput,
  meta: RequestMeta,
) {
  let created;
  try {
    created = await insertDraftMentor(input);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("CONFLICT", `Key "${input.key}" or order ${input.order} is already in use`);
    }
    throw err;
  }
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "mentor.created",
    targetType: "mentor",
    targetId: created.id,
    metadata: { key: created.key },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return created;
}

export async function updateMentorDraft(
  actor: { id: string },
  input: UpdateMentorDraftInput,
  meta: RequestMeta,
) {
  let updated;
  try {
    updated = await updateDraftMentor(input);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("CONFLICT", `Order ${input.order} is already in use by another mentor`);
    }
    throw err;
  }
  if (!updated) {
    throw new AppError(
      "CONFLICT",
      "Mentor not found, or it's currently published - unpublish it first to edit",
    );
  }
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "mentor.draft_saved",
    targetType: "mentor",
    targetId: updated.id,
    metadata: { key: updated.key },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

export async function uploadMentorArt(
  actor: { id: string },
  id: string,
  file: { body: Buffer; contentType: string },
  meta: RequestMeta,
) {
  const mentor = await getMentorById(id);
  if (!mentor) throw new AppError("NOT_FOUND", "Mentor not found");

  const extension = file.contentType === "image/png" ? "png" : "jpg";
  const artKey = `mentors/${id}/art.${extension}`;
  await uploadObject(artKey, file.body, file.contentType);
  const updated = await setMentorArtKey(id, artKey);
  if (!updated) throw new AppError("NOT_FOUND", "Mentor not found");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "mentor.art_uploaded",
    targetType: "mentor",
    targetId: id,
    metadata: { key: mentor.key },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

export async function publishMentor(actor: { id: string }, id: string, meta: RequestMeta) {
  const mentor = await getMentorById(id);
  if (!mentor) throw new AppError("NOT_FOUND", "Mentor not found");
  if (mentor.status !== "draft") {
    throw new AppError("CONFLICT", "Mentor is not a draft");
  }
  validateMentorForPublish(mentor);

  const published = await publishMentorRow(id, actor.id);
  if (!published) throw new AppError("CONFLICT", "Mentor is not a draft");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "mentor.published",
    targetType: "mentor",
    targetId: published.id,
    metadata: { key: published.key },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return published;
}

export async function unpublishMentor(actor: { id: string }, id: string, meta: RequestMeta) {
  const unpublished = await unpublishMentorRow(id);
  if (!unpublished) throw new AppError("CONFLICT", "Mentor not found, or it's not published");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "mentor.unpublished",
    targetType: "mentor",
    targetId: unpublished.id,
    metadata: { key: unpublished.key },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return unpublished;
}
