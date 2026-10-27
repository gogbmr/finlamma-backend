"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import { correctDateOfBirthForAdmin, revealParentContact } from "@/server/onboarding/service";

type RevealResult =
  | { ok: true; name: string; email: string }
  | { ok: false; error: string };

// consent.view is read-only (see docs/PRODUCT_SPEC.md's Onboarding &
// parental consent section) - this reveals PII but never changes anything,
// and every call is logged (inside revealParentContact) with the staff
// member as actor and the child account as target.
export async function revealParentContactAction(userId: string): Promise<RevealResult> {
  try {
    const actor = await requireStaff("consent.view");
    const contact = await revealParentContact(actor, userId, requestMeta(await headers()));
    if (!contact) return { ok: false, error: "No parent contact on file for this account" };
    return { ok: true, name: contact.name, email: contact.email };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    throw err;
  }
}

const CorrectDateOfBirthFormSchema = z.object({
  userId: z.string().uuid("Enter a valid account id"),
  newDateOfBirth: z.iso.date("Enter a valid date"),
  reason: z.string().trim().min(1, "A reason is required"),
});

type CorrectDateOfBirthResult =
  | { ok: true; dateOfBirth: string; isMinor: boolean }
  | { ok: false; error: string };

// App asks batch, section C3 - consent.correct_dob (super_admin only at
// launch, per design review). No per-row lookup page exists for arbitrary
// accounts (adult or minor) - staff paste in the account id directly
// (e.g. from a support ticket or the Clerk dashboard), same reasoning as
// why this lives as a standalone form here rather than a new column on
// the consent-request table below (which only ever lists minors with an
// active consent record, not every account).
export async function correctDateOfBirthAction(input: unknown): Promise<CorrectDateOfBirthResult> {
  try {
    const actor = await requireStaff("consent.correct_dob");
    const parsed = CorrectDateOfBirthFormSchema.parse(input);
    const result = await correctDateOfBirthForAdmin(actor, parsed, requestMeta(await headers()));
    return { ok: true, dateOfBirth: result.dateOfBirth, isMinor: result.isMinor };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof z.ZodError) {
      return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
    }
    throw err;
  }
}
