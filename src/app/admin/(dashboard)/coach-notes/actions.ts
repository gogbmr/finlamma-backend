"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import {
  CoachNoteTemplateIdSchema,
  CreateCoachNoteTemplateSchema,
  UpdateCoachNoteTemplateSchema,
} from "@/server/report-card/schemas";
import {
  createCoachNoteTemplate,
  publishCoachNoteTemplate,
  unpublishCoachNoteTemplate,
  updateCoachNoteTemplate,
} from "@/server/report-card/service";

type ActionResult = { ok: true } | { ok: false; error: string };

// Same runAction/permission-gate pattern as every other admin actions.ts.
// Manage and publish are separate permissions here (coach_note.manage /
// coach_note.publish) because a coach note reaches minors directly on their
// weekly report card - narrower than the mentor/world/lesson content
// permissions, which content_uploader/content_publisher also hold.
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

export async function createCoachNoteTemplateAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("coach_note.manage");
    const parsed = CreateCoachNoteTemplateSchema.parse(input);
    await createCoachNoteTemplate(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/coach-notes");
  });
}

export async function updateCoachNoteTemplateAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("coach_note.manage");
    const parsed = UpdateCoachNoteTemplateSchema.parse(input);
    await updateCoachNoteTemplate(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/coach-notes");
  });
}

export async function publishCoachNoteTemplateAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("coach_note.publish");
    const { id } = CoachNoteTemplateIdSchema.parse(input);
    await publishCoachNoteTemplate(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/coach-notes");
  });
}

export async function unpublishCoachNoteTemplateAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("coach_note.publish");
    const { id } = CoachNoteTemplateIdSchema.parse(input);
    await unpublishCoachNoteTemplate(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/coach-notes");
  });
}
