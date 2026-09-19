"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import {
  InviteStaffMemberSchema,
  SetStaffActiveSchema,
  UpdateStaffRoleSchema,
} from "@/server/staff/schemas";
import {
  changeStaffMemberRole,
  inviteStaffMember,
  setStaffMemberActive,
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
    const actor = await requireStaff("staff.manage");
    const parsed = InviteStaffMemberSchema.parse(input);
    await inviteStaffMember(actor, parsed);
    revalidatePath("/admin/staff");
  });
}

export async function setStaffActiveAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("staff.manage");
    const parsed = SetStaffActiveSchema.parse(input);
    await setStaffMemberActive(actor, parsed.staffId, parsed.active);
    revalidatePath("/admin/staff");
  });
}

export async function updateStaffRoleAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireStaff("staff.manage");
    const parsed = UpdateStaffRoleSchema.parse(input);
    await changeStaffMemberRole(actor, parsed.staffId, parsed.roleId);
    revalidatePath("/admin/staff");
  });
}
