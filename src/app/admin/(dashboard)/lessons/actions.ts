"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { getStaffMember, requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import { roleHasPermission } from "@/server/staff/repo";
import {
  CreateLessonDraftSchema,
  HotfixLessonSchema,
  LessonIdSchema,
  UpdateLessonDraftSchema,
} from "@/server/lessons/schemas";
import {
  createLessonDraft,
  deleteLesson,
  getLessonPreview,
  hotfixLesson,
  publishLesson,
  unpublishLesson,
  updateLessonDraft,
} from "@/server/lessons/service";

type ActionResult = { ok: true } | { ok: false; error: string };
type PreviewResult =
  | { ok: true; data: Awaited<ReturnType<typeof getLessonPreview>> }
  | { ok: false; error: string };

// Same runAction/permission-gate pattern as
// src/app/admin/(dashboard)/worlds/actions.ts. Every action independently
// re-checks the caller's permission here - the page's canEdit/canDelete
// props only control which buttons render, they are never trusted as
// authorization.
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

export async function createLessonDraftAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("lesson.create");
    const parsed = CreateLessonDraftSchema.parse(input);
    await createLessonDraft(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/lessons");
  });
}

export async function updateLessonDraftAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("lesson.edit");
    const parsed = UpdateLessonDraftSchema.parse(input);
    await updateLessonDraft(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/lessons");
  });
}

export async function publishLessonAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("lesson.delete");
    const { id } = LessonIdSchema.parse(input);
    await publishLesson(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/lessons");
  });
}

export async function unpublishLessonAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("lesson.delete");
    const { id } = LessonIdSchema.parse(input);
    await unpublishLesson(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/lessons");
  });
}

export async function hotfixLessonAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("lesson.delete");
    const parsed = HotfixLessonSchema.parse(input);
    await hotfixLesson(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/lessons");
  });
}

// Gated on lesson.delete, not lesson.edit - same reasoning as
// worlds/actions.ts's deleteWorldAction: deletion is permanent and
// irreversible, so it should never be reachable by a role that isn't even
// trusted to publish/unpublish. deleteLesson itself only allows removing a
// draft lesson (a published one must be unpublished first).
export async function deleteLessonAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("lesson.delete");
    const { id } = LessonIdSchema.parse(input);
    await deleteLesson(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/lessons");
  });
}

// Read-only - gated on the single lesson.view permission now (previously
// *either* lesson.manage or lesson.publish, back when view access was only
// ever implicit - see docs/ARCHITECTURE.md D81).
async function requireLessonReadAccess() {
  const staff = await getStaffMember();
  if (!staff) throw new AppError("UNAUTHENTICATED", "Staff sign-in required");
  if (!(await roleHasPermission(staff.roleId, "lesson.view"))) {
    throw new AppError("FORBIDDEN", "Missing permission: lesson.view");
  }
  return staff;
}

// Renders with the exact same answer-free projection the app receives
// (getLessonPreview calls the same toDetail() as getPublicLesson) - but
// works on a draft, which no public/app endpoint ever returns. See
// src/server/lessons/service.ts's getLessonPreview and the Phase 2b
// Checkpoint 4b kickoff discussion.
export async function previewLessonAction(input: unknown): Promise<PreviewResult> {
  try {
    await requireLessonReadAccess();
    const { id } = LessonIdSchema.parse(input);
    const data = await getLessonPreview(id);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ZodError) {
      return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
    }
    throw err;
  }
}
