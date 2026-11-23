import { randomUUID } from "node:crypto";
import { logActivity } from "@/lib/activity-log";
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import {
  imageContentType,
  imageExtension,
  MAX_IMAGE_BYTES,
  sniffImageType,
} from "@/lib/image";
import { getSignedDownloadUrl, uploadObject } from "@/lib/s3";
import { roleHasPermission } from "@/server/staff/repo";
import {
  listAllWorlds,
  listPublishedWorldsByMentorId,
  listWorldsByMentorId,
} from "@/server/worlds/repo";
import {
  deleteMentorRow,
  getMentorById,
  getPublishedMentorByKey,
  hotfixMentorRow,
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
  HotfixMentorInput,
  LocalizedText,
  UpdateMentorDraftInput,
} from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;
type MentorRow = NonNullable<Awaited<ReturnType<typeof getMentorById>>>;

async function toPublicMentor(row: MentorRow) {
  return {
    // App asks batch, item A13 (BLOCKING): POST /doubt-zone/threads needs a
    // UUID mentorId, but this endpoint only ever returned `key`. Every
    // mentor row already has a real uuid `id` (idAndTimestamps()) - this
    // was just never selected into the public shape before. `key` stays
    // unchanged, still the stable slug other callers already rely on.
    id: row.id,
    key: row.key,
    order: row.order,
    name: row.name,
    bio: row.bio,
    artUrl: row.artKey ? await getSignedDownloadUrl(row.artKey) : null,
  };
}

export async function getPublicMentors() {
  const rows = await listPublishedMentors();
  // toPublicMentor only calls getSignedDownloadUrl (S3), never Postgres.
  // promise-all-db-concurrency-ok: S3-backed, not a Postgres query
  return Promise.all(rows.map(toPublicMentor));
}

export async function getPublicMentorByKey(key: string) {
  const row = await getPublishedMentorByKey(key);
  if (!row)
    throw new AppError("NOT_FOUND", `No published mentor with key "${key}"`);
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

// D25 (docs/ARCHITECTURE.md): usedByWorlds is a read-only, computed "Used
// by" list for the admin editor - derived entirely from worlds.mentorId,
// never a stored field on this row, since a mentor can cover any number of
// worlds and worlds are the only source of truth for that assignment. One
// query for every world plus an in-memory group-by, mirroring
// src/server/worlds/service.ts's mentorKeyById() (the reverse lookup) -
// avoids an N+1 query per mentor.
export async function getMentorEditorData() {
  const [rows, allWorlds] = await Promise.all([
    listAllMentors(),
    listAllWorlds(),
  ]);
  const worldsByMentorId = new Map<
    string,
    { id: string; title: LocalizedText; status: "draft" | "published" }[]
  >();
  for (const w of allWorlds) {
    const list = worldsByMentorId.get(w.mentorId) ?? [];
    list.push({ id: w.id, title: w.title, status: w.status });
    worldsByMentorId.set(w.mentorId, list);
  }

  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      artUrl: row.artKey ? await getSignedDownloadUrl(row.artKey) : null,
      usedByWorlds: worldsByMentorId.get(row.id) ?? [],
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
      throw new AppError(
        "CONFLICT",
        `Key "${input.key}" or order ${input.order} is already in use`,
      );
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
      throw new AppError(
        "CONFLICT",
        `Order ${input.order} is already in use by another mentor`,
      );
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

// Same live-content trust tier as D20's hotfix mechanism (docs/ARCHITECTURE.md):
// replacing a DRAFT mentor's art only needs mentor.edit (the normal editing
// tier), but replacing a PUBLISHED mentor's art - instantly visible to every
// learner, no review step - needs mentor.delete, exactly like the
// name/bio hotfix path. Authoritative here (not just at the action layer),
// since only this function knows the mentor's actual status. The action
// layer's own requireStaff() call is a cheap early reject (at least one of
// the two permissions), not the source of truth for which tier applies.
export async function uploadMentorArt(
  actor: { id: string; roleId: string },
  id: string,
  file: { body: Buffer },
  meta: RequestMeta,
) {
  const mentor = await getMentorById(id);
  if (!mentor) throw new AppError("NOT_FOUND", "Mentor not found");

  const requiredPermission =
    mentor.status === "published" ? "mentor.delete" : "mentor.edit";
  if (!(await roleHasPermission(actor.roleId, requiredPermission))) {
    throw new AppError(
      "FORBIDDEN",
      mentor.status === "published"
        ? "Uploading art for a published mentor requires mentor.delete"
        : "Missing permission: mentor.edit",
    );
  }

  if (file.body.byteLength > MAX_IMAGE_BYTES) {
    throw new AppError("VALIDATION_FAILED", "Art must be 2MB or smaller");
  }

  // Never trusts a client-supplied Content-Type or filename extension for
  // either the allowlist check or the S3 key/content-type we actually
  // store - both are sniffed from the real bytes. This is what makes an
  // SVG (which can carry a <script> payload) impossible to upload here no
  // matter what header or filename accompanies it - see src/lib/image.ts.
  const detectedType = sniffImageType(file.body);
  if (!detectedType) {
    throw new AppError(
      "VALIDATION_FAILED",
      "Art must be a valid PNG, JPEG or WebP image",
    );
  }

  // A unique key per upload (not a fixed per-mentor path) - replacing art
  // never deletes or overwrites the previous object, so a bad upload to
  // live content can be reverted by re-pointing artKey at the previous key
  // recorded below, without needing the original file again.
  const artKey = `mentors/${id}/${randomUUID()}.${imageExtension(detectedType)}`;
  await uploadObject(artKey, file.body, imageContentType(detectedType));
  const updated = await setMentorArtKey(id, artKey);
  if (!updated) throw new AppError("NOT_FOUND", "Mentor not found");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "mentor.art_uploaded",
    targetType: "mentor",
    targetId: id,
    metadata: {
      key: mentor.key,
      previousArtKey: mentor.artKey,
      newArtKey: artKey,
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

export async function publishMentor(
  actor: { id: string },
  id: string,
  meta: RequestMeta,
) {
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

// D20 (docs/ARCHITECTURE.md): fixes a typo on an already-PUBLISHED mentor's
// name/bio directly, without the unpublish -> edit draft -> republish cycle
// - which is impossible here anyway once any published world references the
// mentor (unpublishMentor above blocks it). Requires mentor.delete (not
// just mentor.edit), same trust bar as publishing. Re-runs the same
// translation-completeness gate publish itself uses, so a hotfix can never
// leave a published mentor less complete than publish would have allowed.
export async function hotfixMentor(
  actor: { id: string },
  input: HotfixMentorInput,
  meta: RequestMeta,
) {
  const existing = await getMentorById(input.id);
  if (!existing) throw new AppError("NOT_FOUND", "Mentor not found");
  if (existing.status !== "published") {
    throw new AppError(
      "CONFLICT",
      "Mentor is not published - edit its draft instead",
    );
  }

  validateMentorForPublish({ ...existing, ...input });

  const updated = await hotfixMentorRow(input);
  if (!updated)
    throw new AppError(
      "CONFLICT",
      "Mentor is not published - edit its draft instead",
    );

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "mentor.hotfixed",
    targetType: "mentor",
    targetId: updated.id,
    metadata: { key: updated.key },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

export async function unpublishMentor(
  actor: { id: string },
  id: string,
  meta: RequestMeta,
) {
  // Blocked while any published world still references this mentor - a
  // learner in that world must always have a real mentor to meet. Checked
  // before the unpublish itself, not as a post-hoc rollback, so a mentor
  // that's actually in use is never even briefly unpublished.
  const referencingWorlds = await listPublishedWorldsByMentorId(id);
  if (referencingWorlds.length > 0) {
    const titles = referencingWorlds.map((w) => w.title.en).join(", ");
    throw new AppError(
      "CONFLICT",
      `Cannot unpublish: still referenced by published world(s): ${titles}`,
      { worldIds: referencingWorlds.map((w) => w.id) },
    );
  }

  const unpublished = await unpublishMentorRow(id);
  if (!unpublished)
    throw new AppError("CONFLICT", "Mentor not found, or it's not published");

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

// Draft-only, permanent removal. Unlike lessons/service.ts's deleteLesson
// or questions/service.ts's deleteQuestion, this DOES need a child-
// reference check first: worlds.mentorId is a real, mandatory FK (NOT
// NULL, onDelete: "restrict"), so a draft mentor can just as easily be
// assigned to a world as a published one - checked against EVERY world
// (any status), not just published ones, same shape as worlds/service.ts's
// own deleteWorld checking for child lessons. The isForeignKeyViolation
// catch below is a backstop for a world being assigned to this mentor in
// the gap between that check and the delete itself, same reasoning as
// deleteWorld's own catch.
export async function deleteMentor(actor: { id: string }, id: string, meta: RequestMeta) {
  const mentor = await getMentorById(id);
  if (!mentor) throw new AppError("NOT_FOUND", "Mentor not found");

  const referencingWorlds = await listWorldsByMentorId(id);
  if (referencingWorlds.length > 0) {
    const titles = referencingWorlds.map((w) => w.title.en).join(", ");
    throw new AppError(
      "CONFLICT",
      `Cannot delete: still assigned to world(s): ${titles} - reassign them first`,
      { worldIds: referencingWorlds.map((w) => w.id) },
    );
  }

  let deleted;
  try {
    deleted = await deleteMentorRow(id);
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      throw new AppError(
        "CONFLICT",
        "Cannot delete: a world was just assigned to this mentor - reassign it first",
      );
    }
    throw err;
  }
  if (!deleted) {
    throw new AppError(
      "CONFLICT",
      "Mentor not found, or it's currently published - unpublish it first to delete",
    );
  }

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "mentor.deleted",
    targetType: "mentor",
    targetId: id,
    metadata: { key: mentor.key },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return deleted;
}
