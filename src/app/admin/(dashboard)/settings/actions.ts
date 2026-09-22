"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import { LessonFlowScoringSchema } from "@/server/settings/schemas";
import { updateLessonFlowScoringSettings } from "@/server/settings/service";

type ActionResult = { ok: true } | { ok: false; error: string };

// Same runAction/permission-gate pattern as every other admin actions.ts -
// gated on settings.manage, which scripts/seed-roles.ts grants to
// super_admin only.
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

export async function updateLessonFlowScoringAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("settings.manage");
    const parsed = LessonFlowScoringSchema.parse(input);
    await updateLessonFlowScoringSettings(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/settings");
  });
}
