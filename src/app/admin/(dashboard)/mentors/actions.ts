"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { requireStaff, requireStaffAny } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import {
  CreateMentorDraftSchema,
  HotfixMentorSchema,
  MentorIdSchema,
  UpdateMentorDraftSchema,
} from "@/server/mentors/schemas";
import {
  createMentorDraft,
  deleteMentor,
  hotfixMentor,
  publishMentor,
  unpublishMentor,
  updateMentorDraft,
  uploadMentorArt,
} from "@/server/mentors/service";

type ActionResult = { ok: true } | { ok: false; error: string };

// Same runAction/permission-gate pattern as
// src/app/admin/(dashboard)/legal/actions.ts and .../staff/actions.ts.
// Every action independently re-checks the caller's permission here - the
// page's canEdit/canDelete props only control which buttons render, they
// are never trusted as authorization.
async function runAction(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ZodError) {
      return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
    }
    throw err;
  }
}

export async function createMentorDraftAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("mentor.create");
    const parsed = CreateMentorDraftSchema.parse(input);
    await createMentorDraft(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/mentors");
  });
}

export async function updateMentorDraftAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("mentor.edit");
    const parsed = UpdateMentorDraftSchema.parse(input);
    await updateMentorDraft(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/mentors");
  });
}

export async function publishMentorAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("mentor.delete");
    const { id } = MentorIdSchema.parse(input);
    await publishMentor(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/mentors");
  });
}

export async function unpublishMentorAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("mentor.delete");
    const { id } = MentorIdSchema.parse(input);
    await unpublishMentor(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/mentors");
  });
}

export async function hotfixMentorAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("mentor.delete");
    const parsed = HotfixMentorSchema.parse(input);
    await hotfixMentor(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/mentors");
  });
}

// Gated on mentor.delete, not mentor.edit - same reasoning as
// worlds/actions.ts's deleteWorldAction and lessons/actions.ts's
// deleteLessonAction: deletion is permanent and irreversible. deleteMentor
// itself only allows removing a draft mentor with no world still assigned
// to it.
export async function deleteMentorAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("mentor.delete");
    const { id } = MentorIdSchema.parse(input);
    await deleteMentor(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/mentors");
  });
}

// No Content-Type/extension/size check here on purpose - a client-supplied
// File.type or filename is not evidence of anything (a Server Action can be
// called directly, not just through this form). The only real check is
// uploadMentorArt's byte-level format sniff and size cap (src/lib/image.ts),
// which this delegates to unconditionally.
//
// Gated on EITHER mentor.edit or mentor.delete here - a cheap early
// reject only. uploadMentorArt itself (which already loads the mentor)
// re-checks the exact required permission for this mentor's actual status
// (edit for a draft, delete for a published one) - see its own comment.
export async function uploadMentorArtAction(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaffAny(["mentor.edit", "mentor.delete"]);
    const id = MentorIdSchema.parse({ id: formData.get("id") }).id;
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_FAILED", "No file provided");
    }
    const body = Buffer.from(await file.arrayBuffer());
    await uploadMentorArt(actor, id, { body }, requestMeta(await headers()));
    revalidatePath("/admin/mentors");
  });
}
