"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import {
  CreateMentorDraftSchema,
  MentorIdSchema,
  UpdateMentorDraftSchema,
} from "@/server/mentors/schemas";
import {
  createMentorDraft,
  publishMentor,
  unpublishMentor,
  updateMentorDraft,
  uploadMentorArt,
} from "@/server/mentors/service";

type ActionResult = { ok: true } | { ok: false; error: string };

// Same runAction/permission-gate pattern as
// src/app/admin/(dashboard)/legal/actions.ts and .../staff/actions.ts.
// Every action independently re-checks the caller's permission here - the
// page's canManage/canPublish props only control which buttons render, they
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
    const actor = await requireStaff("mentor.manage");
    const parsed = CreateMentorDraftSchema.parse(input);
    await createMentorDraft(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/mentors");
  });
}

export async function updateMentorDraftAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("mentor.manage");
    const parsed = UpdateMentorDraftSchema.parse(input);
    await updateMentorDraft(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/mentors");
  });
}

export async function publishMentorAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("mentor.publish");
    const { id } = MentorIdSchema.parse(input);
    await publishMentor(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/mentors");
  });
}

export async function unpublishMentorAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("mentor.publish");
    const { id } = MentorIdSchema.parse(input);
    await unpublishMentor(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/mentors");
  });
}

const MAX_ART_BYTES = 2 * 1024 * 1024;
const ALLOWED_ART_TYPES = new Set(["image/png", "image/jpeg"]);

export async function uploadMentorArtAction(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("mentor.manage");
    const id = MentorIdSchema.parse({ id: formData.get("id") }).id;
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_FAILED", "No file provided");
    }
    if (!ALLOWED_ART_TYPES.has(file.type)) {
      throw new AppError("VALIDATION_FAILED", "Art must be a PNG or JPEG image");
    }
    if (file.size > MAX_ART_BYTES) {
      throw new AppError("VALIDATION_FAILED", "Art must be 2MB or smaller");
    }
    const body = Buffer.from(await file.arrayBuffer());
    await uploadMentorArt(actor, id, { body, contentType: file.type }, requestMeta(await headers()));
    revalidatePath("/admin/mentors");
  });
}
