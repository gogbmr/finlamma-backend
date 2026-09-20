"use server";

import { headers } from "next/headers";
import { requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import { revealParentContact } from "@/server/onboarding/service";

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
