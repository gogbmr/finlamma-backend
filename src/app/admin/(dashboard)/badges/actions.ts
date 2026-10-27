"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import { BadgeIdSchema, CreateBadgeDraftSchema, UpdateBadgeDraftSchema } from "@/server/badges/schemas";
import {
  createBadgeDraft,
  publishBadge,
  unpublishBadge,
  updateBadgeDraft,
  uploadBadgeIcon,
} from "@/server/badges/service";

type ActionResult = { ok: true } | { ok: false; error: string };

// Same runAction/permission-gate pattern as every other admin actions.ts -
// gated on economy.manage (per the decided design: badges/rewards live
// under the same trust bar as reward_rules/the VM multiplier, not a new
// permission).
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

export async function createBadgeDraftAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("economy.manage");
    const parsed = CreateBadgeDraftSchema.parse(input);
    await createBadgeDraft(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/badges");
  });
}

export async function updateBadgeDraftAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("economy.manage");
    const parsed = UpdateBadgeDraftSchema.parse(input);
    await updateBadgeDraft(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/badges");
  });
}

export async function publishBadgeAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("economy.manage");
    const { id } = BadgeIdSchema.parse(input);
    await publishBadge(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/badges");
  });
}

export async function unpublishBadgeAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("economy.manage");
    const { id } = BadgeIdSchema.parse(input);
    await unpublishBadge(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/badges");
  });
}

// App asks batch, item A10. No Content-Type/extension/size check here on
// purpose - uploadBadgeIcon's own byte-level format sniff and size cap
// (src/lib/image.ts) is the only real check, same reasoning as
// uploadMentorArtAction.
export async function uploadBadgeIconAction(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("economy.manage");
    const id = BadgeIdSchema.parse({ id: formData.get("id") }).id;
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_FAILED", "No file provided");
    }
    const body = Buffer.from(await file.arrayBuffer());
    await uploadBadgeIcon(actor, id, { body }, requestMeta(await headers()));
    revalidatePath("/admin/badges");
  });
}
