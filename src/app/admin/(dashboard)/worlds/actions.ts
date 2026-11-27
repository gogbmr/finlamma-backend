"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { requireStaff, requireStaffAny } from "@/lib/auth";
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
  deleteWorld,
  hotfixWorld,
  publishWorld,
  reorderWorld,
  unpublishWorld,
  updateWorldDraft,
  uploadWorldArt,
  uploadWorldCardMedia,
} from "@/server/worlds/service";

type ActionResult = { ok: true } | { ok: false; error: string };

// Same runAction/permission-gate pattern as
// src/app/admin/(dashboard)/mentors/actions.ts. Every action independently
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

export async function createWorldDraftAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("world.create");
    const parsed = CreateWorldDraftSchema.parse(input);
    await createWorldDraft(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/worlds");
  });
}

export async function updateWorldDraftAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("world.edit");
    const parsed = UpdateWorldDraftSchema.parse(input);
    await updateWorldDraft(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/worlds");
    revalidatePath(`/admin/worlds/${parsed.id}`);
    revalidatePath(`/admin/worlds/${parsed.id}/edit`);
  });
}

// Gated on EITHER world.edit or world.delete here - a cheap early
// reject only. Reordering a DRAFT world is a structural content operation
// (world.edit is enough), but reordering a PUBLISHED world moves its
// position in the sequential-unlock chain and, per D25, can shift which
// world sits at the trading-unlock position - so that needs world.delete
// (the publish-tier bundle - see docs/ARCHITECTURE.md D81), the same trust
// bar as publish/unpublish/delete. reorderWorld itself
// (which already loads the world) re-checks the exact required permission
// for the mover's actual status - see its own comment.
export async function reorderWorldAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaffAny(["world.edit", "world.delete"]);
    const { id, newOrder } = MoveWorldSchema.parse(input);
    await reorderWorld(actor, id, newOrder, requestMeta(await headers()));
    revalidatePath("/admin/worlds");
    revalidatePath(`/admin/worlds/${id}`);
    revalidatePath(`/admin/worlds/${id}/edit`);
  });
}

export async function publishWorldAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("world.delete");
    const { id } = WorldIdSchema.parse(input);
    await publishWorld(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/worlds");
    revalidatePath(`/admin/worlds/${id}`);
    revalidatePath(`/admin/worlds/${id}/edit`);
  });
}

export async function unpublishWorldAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("world.delete");
    const { id } = WorldIdSchema.parse(input);
    await unpublishWorld(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/worlds");
    revalidatePath(`/admin/worlds/${id}`);
    revalidatePath(`/admin/worlds/${id}/edit`);
  });
}

export async function hotfixWorldAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("world.delete");
    const parsed = HotfixWorldSchema.parse(input);
    await hotfixWorld(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/worlds");
    revalidatePath(`/admin/worlds/${parsed.id}`);
    revalidatePath(`/admin/worlds/${parsed.id}/edit`);
  });
}

// D25 (docs/ARCHITECTURE.md): permanent removal, gated on world.delete -
// the publish-tier bundle, not world.edit - since deletion is stronger and irreversible compared
// to create/update, and a world can be deleted regardless of its current
// status (deleteWorld itself blocks this unless the world has zero
// lessons), so this should never be reachable by a role that isn't even
// trusted to unpublish a live world.
export async function deleteWorldAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("world.delete");
    const { id } = WorldIdSchema.parse(input);
    await deleteWorld(actor, id, requestMeta(await headers()));
    revalidatePath("/admin/worlds");
  });
}

// No Content-Type/extension/size check here on purpose - see
// src/app/admin/(dashboard)/mentors/actions.ts's uploadMentorArtAction,
// which this mirrors exactly. The only real check is uploadWorldArt's
// byte-level format sniff and size cap (src/lib/image.ts). Gated on EITHER
// world.edit or world.delete - uploadWorldArt itself re-checks the
// exact required permission for this world's actual status.
export async function uploadWorldArtAction(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaffAny(["world.edit", "world.delete"]);
    const id = WorldIdSchema.parse({ id: formData.get("id") }).id;
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_FAILED", "No file provided");
    }
    const body = Buffer.from(await file.arrayBuffer());
    await uploadWorldArt(actor, id, { body }, requestMeta(await headers()));
    revalidatePath("/admin/worlds");
    revalidatePath(`/admin/worlds/${id}`);
    revalidatePath(`/admin/worlds/${id}/edit`);
  });
}

// Mirrors uploadWorldArtAction exactly - a second, independent upload
// control for cardMediaKey (the animated card background), never
// confused with artKey's static-art upload above. No size/format check
// here either, same reasoning: uploadWorldCardMedia's own byte-level sniff
// (with GIF allowed) and 1.5MB cap are the real, authoritative checks.
export async function uploadWorldCardMediaAction(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaffAny(["world.edit", "world.delete"]);
    const id = WorldIdSchema.parse({ id: formData.get("id") }).id;
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_FAILED", "No file provided");
    }
    const body = Buffer.from(await file.arrayBuffer());
    await uploadWorldCardMedia(actor, id, { body }, requestMeta(await headers()));
    revalidatePath("/admin/worlds");
    revalidatePath(`/admin/worlds/${id}`);
    revalidatePath(`/admin/worlds/${id}/edit`);
  });
}
