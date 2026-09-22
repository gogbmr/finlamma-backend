"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import {
  CreateQuestionDraftSchema,
  HotfixQuestionSchema,
  QuestionIdSchema,
  UpdateQuestionDraftSchema,
} from "@/server/questions/schemas";
import {
  createQuestionDraft,
  hotfixQuestion,
  publishQuestion,
  unpublishQuestion,
  updateQuestionDraft,
} from "@/server/questions/service";

type ActionResult = { ok: true } | { ok: false; error: string };

// Same runAction/permission-gate pattern as
// src/app/admin/(dashboard)/lessons/actions.ts. Every action independently
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

export async function createQuestionDraftAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("question.manage");
    const parsed = CreateQuestionDraftSchema.parse(input);
    await createQuestionDraft(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/questions");
  });
}

export async function updateQuestionDraftAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("question.manage");
    const parsed = UpdateQuestionDraftSchema.parse(input);
    await updateQuestionDraft(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/questions");
  });
}

export async function publishQuestionAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("question.publish");
    const { id } = QuestionIdSchema.parse(input);
    await publishQuestion(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/questions");
  });
}

export async function unpublishQuestionAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("question.publish");
    const { id } = QuestionIdSchema.parse(input);
    await unpublishQuestion(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/questions");
  });
}

export async function hotfixQuestionAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("question.publish");
    const parsed = HotfixQuestionSchema.parse(input);
    await hotfixQuestion(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/questions");
  });
}
