"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import { PublishLegalDocumentSchema, SaveLegalDraftSchema } from "@/server/legal/schemas";
import { publishLegalDocument, upsertLegalDraft } from "@/server/legal/service";
import { notifyAffectedMinorsForReapproval } from "@/server/onboarding/service";

type ActionResult = { ok: true } | { ok: false; error: string };

// Same runAction/permission-gate pattern as src/app/admin/(dashboard)/staff/actions.ts.
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

export async function saveLegalDraftAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("legal.manage");
    const parsed = SaveLegalDraftSchema.parse(input);
    await upsertLegalDraft(actor, parsed.type, parsed.content, requestMeta(await headers()));
    revalidatePath("/admin/legal");
  });
}

export async function publishLegalDocumentAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("legal.manage");
    const parsed = PublishLegalDocumentSchema.parse(input);
    const meta = requestMeta(await headers());
    const published = await publishLegalDocument(actor, parsed.type, parsed.requiresParentReapproval, meta);
    if (published.requiresParentReapproval) {
      await notifyAffectedMinorsForReapproval(published.id, meta);
    }
    revalidatePath("/admin/legal");
  });
}
