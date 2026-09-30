"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import {
  createCompetitionDraft,
  publishCompetition,
  updateCompetitionDraft,
  updateCompetitionSettingsForAdmin,
} from "@/server/competitions/service";
import { CompetitionDraftInputSchema, CompetitionSettingsInputSchema } from "@/server/competitions/schemas";

type ActionResult = { ok: true } | { ok: false; error: string };

// economy.manage - competitions set real VM prize amounts directly, same
// trust bar as reward_rules/the VM multiplier/Arena's league settings.
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

export async function createCompetitionDraftAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("economy.manage");
    const parsed = CompetitionDraftInputSchema.parse(input);
    await createCompetitionDraft(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/competitions");
  });
}

export async function updateCompetitionDraftAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("economy.manage");
    const parsed = CompetitionDraftInputSchema.parse(input);
    await updateCompetitionDraft(actor, id, parsed, requestMeta(await headers()));
    revalidatePath("/admin/competitions");
  });
}

export async function publishCompetitionAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("economy.manage");
    await publishCompetition(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/competitions");
  });
}

export async function updateCompetitionSettingsAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("economy.manage");
    const parsed = CompetitionSettingsInputSchema.parse(input);
    await updateCompetitionSettingsForAdmin(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/competitions");
  });
}
