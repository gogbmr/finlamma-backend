"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import { getQuestionDetailForAdmin } from "@/server/questions/admin-queries";
import {
  CreateQuestionDraftSchema,
  HotfixQuestionSchema,
  QuestionIdSchema,
  UpdateQuestionDraftSchema,
  type QuestionFormat,
} from "@/server/questions/schemas";
import {
  createQuestionDraft,
  deleteQuestion,
  hotfixQuestion,
  publishQuestion,
  unpublishQuestion,
  updateQuestionDraft,
} from "@/server/questions/service";
import type { LocalizedText } from "@/server/shared/schemas";

type ActionResult = { ok: true } | { ok: false; error: string };

// Same runAction/permission-gate pattern as
// src/app/admin/(dashboard)/lessons/actions.ts. Every action independently
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

export async function createQuestionDraftAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("question.create");
    const parsed = CreateQuestionDraftSchema.parse(input);
    await createQuestionDraft(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/questions");
  });
}

export async function updateQuestionDraftAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("question.edit");
    const parsed = UpdateQuestionDraftSchema.parse(input);
    await updateQuestionDraft(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/questions");
  });
}

export async function publishQuestionAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("question.delete");
    const { id } = QuestionIdSchema.parse(input);
    await publishQuestion(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/questions");
  });
}

export async function unpublishQuestionAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("question.delete");
    const { id } = QuestionIdSchema.parse(input);
    await unpublishQuestion(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/questions");
  });
}

export async function hotfixQuestionAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("question.delete");
    const parsed = HotfixQuestionSchema.parse(input);
    await hotfixQuestion(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/questions");
  });
}

// Gated on question.delete, not question.edit - same reasoning as
// worlds/actions.ts's deleteWorldAction and lessons/actions.ts's
// deleteLessonAction: deletion is permanent and irreversible. deleteQuestion
// itself only allows removing a draft question (a published one must be
// unpublished first).
export async function deleteQuestionAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("question.delete");
    const { id } = QuestionIdSchema.parse(input);
    await deleteQuestion(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/questions");
  });
}

type QuestionDetail = {
  id: string;
  format: QuestionFormat;
  topicId: string | null;
  prompt: LocalizedText;
  explanation: LocalizedText;
  payload: unknown;
  answer: unknown;
  status: "draft" | "published";
};
type QuestionDetailResult = { ok: true; data: QuestionDetail } | { ok: false; error: string };

// Read-only. The Questions admin list is now real-DB-paginated (Task 3b,
// src/server/questions/admin-queries.ts), so the full record for a
// selected question is no longer already sitting in memory from a
// full-table fetch - this loads it on demand. Gated on the single
// question.view permission now (previously EITHER question.manage or
// question.publish, back when view access was only ever implicit - see
// docs/ARCHITECTURE.md D81).
export async function loadQuestionDetailForAdminAction(input: unknown): Promise<QuestionDetailResult> {
  try {
    await requireStaff("question.view");
    const { id } = QuestionIdSchema.parse(input);
    const row = await getQuestionDetailForAdmin(id);
    if (!row) return { ok: false, error: "Question not found" };
    return {
      ok: true,
      data: {
        id: row.id,
        format: row.format,
        topicId: row.topicId,
        prompt: row.prompt,
        explanation: row.explanation,
        payload: row.payload,
        answer: row.answer,
        status: row.status,
      },
    };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ZodError) {
      return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
    }
    throw err;
  }
}
