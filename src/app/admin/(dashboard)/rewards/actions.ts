"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import {
  CreateRewardDraftSchema,
  RefundRewardClaimSchema,
  RewardIdSchema,
  UpdateRewardDraftSchema,
} from "@/server/rewards/schemas";
import {
  createRewardDraft,
  publishReward,
  refundRewardClaim,
  unpublishReward,
  updateRewardDraft,
} from "@/server/rewards/service";

type ActionResult = { ok: true } | { ok: false; error: string };

// Same runAction/permission-gate pattern as every other admin actions.ts -
// gated on economy.manage.
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

export async function createRewardDraftAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("economy.manage");
    const parsed = CreateRewardDraftSchema.parse(input);
    await createRewardDraft(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/rewards");
  });
}

export async function updateRewardDraftAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("economy.manage");
    const parsed = UpdateRewardDraftSchema.parse(input);
    await updateRewardDraft(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/rewards");
  });
}

export async function publishRewardAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("economy.manage");
    const { id } = RewardIdSchema.parse(input);
    await publishReward(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/rewards");
  });
}

export async function unpublishRewardAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("economy.manage");
    const { id } = RewardIdSchema.parse(input);
    await unpublishReward(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/rewards");
  });
}

export async function refundRewardClaimAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("economy.manage");
    const { claimId, reason } = RefundRewardClaimSchema.parse(input);
    await refundRewardClaim(actor, claimId, reason, requestMeta(await headers()));
    revalidatePath("/admin/rewards");
  });
}
