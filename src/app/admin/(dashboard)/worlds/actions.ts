"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import {
  CreateWorldDraftSchema,
  HotfixWorldSchema,
  MoveWorldSchema,
  UpdateWorldDraftSchema,
  WorldIdSchema,
} from "@/server/worlds/schemas";
import {
  createWorldDraft,
  hotfixWorld,
  publishWorld,
  reorderWorld,
  unpublishWorld,
  updateWorldDraft,
  uploadWorldArt,
} from "@/server/worlds/service";

type ActionResult = { ok: true } | { ok: false; error: string };

// Same runAction/permission-gate pattern as
// src/app/admin/(dashboard)/mentors/actions.ts. Every action independently
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

export async function createWorldDraftAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("world.manage");
    const parsed = CreateWorldDraftSchema.parse(input);
    await createWorldDraft(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/worlds");
  });
}

export async function updateWorldDraftAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("world.manage");
    const parsed = UpdateWorldDraftSchema.parse(input);
    await updateWorldDraft(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/worlds");
  });
}

// Gated on world.manage (not world.publish) - reordering is a structural
// content operation, not a visibility/trust decision, same reasoning as
// src/server/worlds/service.ts's reorderWorld.
export async function reorderWorldAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("world.manage");
    const { id, newOrder } = MoveWorldSchema.parse(input);
    await reorderWorld(actor, id, newOrder, requestMeta(await headers()));
    revalidatePath("/admin/worlds");
  });
}

export async function publishWorldAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("world.publish");
    const { id } = WorldIdSchema.parse(input);
    await publishWorld(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/worlds");
  });
}

export async function unpublishWorldAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("world.publish");
    const { id } = WorldIdSchema.parse(input);
    await unpublishWorld(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/worlds");
  });
}

export async function hotfixWorldAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("world.publish");
    const parsed = HotfixWorldSchema.parse(input);
    await hotfixWorld(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/worlds");
  });
}

// No Content-Type/extension/size check here on purpose - see
// src/app/admin/(dashboard)/mentors/actions.ts's uploadMentorArtAction,
// which this mirrors exactly. The only real check is uploadWorldArt's
// byte-level format sniff and size cap (src/lib/image.ts).
export async function uploadWorldArtAction(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("world.manage");
    const id = WorldIdSchema.parse({ id: formData.get("id") }).id;
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_FAILED", "No file provided");
    }
    const body = Buffer.from(await file.arrayBuffer());
    await uploadWorldArt(actor, id, { body }, requestMeta(await headers()));
    revalidatePath("/admin/worlds");
  });
}
