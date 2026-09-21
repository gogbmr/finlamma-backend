"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import {
  CreateLessonDraftSchema,
  LessonIdSchema,
  UpdateLessonDraftSchema,
} from "@/server/lessons/schemas";
import {
  createLessonDraft,
  publishLesson,
  unpublishLesson,
  updateLessonDraft,
} from "@/server/lessons/service";

type ActionResult = { ok: true } | { ok: false; error: string };

// Same runAction/permission-gate pattern as
// src/app/admin/(dashboard)/worlds/actions.ts. Every action independently
// re-checks the caller's permission here - the page's canManage/canPublish
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
    const actor = await requireStaff("lesson.manage");
    const parsed = CreateLessonDraftSchema.parse(input);
    await createLessonDraft(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/lessons");
  });
}

export async function updateLessonDraftAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("lesson.manage");
    const parsed = UpdateLessonDraftSchema.parse(input);
    await updateLessonDraft(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/lessons");
  });
}

export async function publishLessonAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("lesson.publish");
    const { id } = LessonIdSchema.parse(input);
    await publishLesson(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/lessons");
  });
}

export async function unpublishLessonAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("lesson.publish");
    const { id } = LessonIdSchema.parse(input);
    await unpublishLesson(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/lessons");
  });
}
