"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { getStaffMember, requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import {
  CreateRoleSchema,
  DeleteRoleSchema,
  InviteStaffMemberSchema,
  SetRolePermissionsSchema,
  SetStaffActiveSchema,
  UpdateRoleSchema,
  UpdateStaffProfileSchema,
  UpdateStaffRoleSchema,
} from "@/server/staff/schemas";
import {
  changeStaffMemberRole,
  createRole,
  deleteRole,
  inviteStaffMember,
  setRolePermissions,
  setStaffMemberActive,
  updateRole,
  updateStaffProfile,
  uploadStaffPhoto,
} from "@/server/staff/service";

type ActionResult = { ok: true } | { ok: false; error: string };

// Server Actions aren't /api/v1 routes (see docs/ARCHITECTURE.md: OpenAPI
// documents the mobile app's contract, admin isn't part of it), but they
// still authenticate, validate and log every mutation the same as any
// endpoint (non-negotiable rule 1). Catches AppError/ZodError into a result
// object instead of throwing, so the client form can show a plain-English
// message - an unexpected error still throws through to Next's error
// boundary, same as withErrors() does for API routes.
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

export async function inviteStaffMemberAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("staff.create");
    const parsed = InviteStaffMemberSchema.parse(input);
    await inviteStaffMember(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/staff");
  });
}

export async function setStaffActiveAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("staff.delete");
    const parsed = SetStaffActiveSchema.parse(input);
    await setStaffMemberActive(actor, parsed.staffId, parsed.active, requestMeta(await headers()));
    revalidatePath("/admin/staff");
  });
}

export async function updateStaffRoleAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("staff.edit");
    const parsed = UpdateStaffRoleSchema.parse(input);
    await changeStaffMemberRole(
      actor,
      parsed.staffId,
      parsed.roleId,
      requestMeta(await headers()),
    );
    revalidatePath("/admin/staff");
  });
}

// Self-or-staff.edit authorization lives in the service layer (see
// src/server/staff/service.ts's updateStaffProfile/uploadStaffPhoto) - the
// actor here is just "the signed-in staff member," not permission-checked
// at this layer, since a staff member editing their OWN profile never
// needs staff.edit at all.
export async function updateStaffProfileAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await getStaffMember();
    if (!actor) throw new AppError("UNAUTHENTICATED", "Staff sign-in required");
    const parsed = UpdateStaffProfileSchema.parse(input);
    await updateStaffProfile(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/staff");
  });
}

export async function uploadStaffPhotoAction(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await getStaffMember();
    if (!actor) throw new AppError("UNAUTHENTICATED", "Staff sign-in required");
    const staffId = String(formData.get("staffId") ?? "");
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_FAILED", "No file provided");
    }
    const body = Buffer.from(await file.arrayBuffer());
    await uploadStaffPhoto(actor, staffId, { body }, requestMeta(await headers()));
    revalidatePath("/admin/staff");
  });
}

export async function createRoleAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("roles.create");
    const parsed = CreateRoleSchema.parse(input);
    await createRole(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/staff");
    revalidatePath("/admin/roles");
  });
}

export async function updateRoleAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("roles.edit");
    const parsed = UpdateRoleSchema.parse(input);
    await updateRole(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/staff");
    revalidatePath("/admin/roles");
  });
}

export async function deleteRoleAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("roles.delete");
    const parsed = DeleteRoleSchema.parse(input);
    await deleteRole(actor, parsed.roleId, requestMeta(await headers()));
    revalidatePath("/admin/staff");
    revalidatePath("/admin/roles");
  });
}

export async function setRolePermissionsAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("roles.edit");
    const parsed = SetRolePermissionsSchema.parse(input);
    await setRolePermissions(actor, parsed, requestMeta(await headers()));
    revalidatePath("/admin/roles");
  });
}
