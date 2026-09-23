"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import type { RewardActivityKind } from "@/server/economy/repo";
import { RewardRuleUpdateSchema, VmIssuanceMultiplierSchema } from "@/server/economy/schemas";
import { updateRewardRuleForAdmin, updateVmIssuanceMultiplier } from "@/server/economy/service";
import { LessonFlowScoringSchema } from "@/server/settings/schemas";
import { updateLessonFlowScoringSettings } from "@/server/settings/service";
import { StreaksSettingsSchema } from "@/server/streaks/schemas";
import { updateStreaksSettings } from "@/server/streaks/service";

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

export async function updateVmIssuanceMultiplierAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("economy.manage");
    const parsed = VmIssuanceMultiplierSchema.parse(input);
    await updateVmIssuanceMultiplier(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/settings");
  });
}

export async function updateRewardRuleAction(
  activityKind: RewardActivityKind,
  input: unknown,
): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("economy.manage");
    const parsed = RewardRuleUpdateSchema.parse(input);
    await updateRewardRuleForAdmin(actor, activityKind, parsed, requestMeta(await headers()));
    revalidatePath("/admin/settings");
  });
}

export async function updateStreaksSettingsAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("settings.manage");
    const parsed = StreaksSettingsSchema.parse(input);
    await updateStreaksSettings(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/settings");
  });
}
