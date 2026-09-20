"use server";

import { headers } from "next/headers";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import {
  approveReapproval,
  confirmParentConsent,
  declineParentConsent,
  declineReapproval,
  withdrawParentConsent,
} from "@/server/onboarding/service";

type ChildResult = { ok: true; childFirstName: string } | { ok: false; error: string };
type WithdrawResult =
  | { ok: true; childFirstName: string; alreadyWithdrawn: boolean }
  | { ok: false; error: string };

// Public - no requireUser/requireStaff. The token itself is the only
// credential (see docs/PRODUCT_SPEC.md's Onboarding & parental consent
// section): a parent has no Finlamma account to authenticate with. Never
// called on page render (GET) - only from an actual button press, per the
// GET-must-be-side-effect-free rule (email security scanners prefetch
// links).
export async function confirmParentConsentAction(token: string): Promise<ChildResult> {
  try {
    const result = await confirmParentConsent(token, requestMeta(await headers()));
    return { ok: true, childFirstName: result.childFirstName };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function declineParentConsentAction(token: string): Promise<ChildResult> {
  try {
    const result = await declineParentConsent(token, requestMeta(await headers()));
    return { ok: true, childFirstName: result.childFirstName };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function withdrawParentConsentAction(token: string): Promise<WithdrawResult> {
  try {
    const result = await withdrawParentConsent(token, requestMeta(await headers()));
    return { ok: true, childFirstName: result.childFirstName, alreadyWithdrawn: result.alreadyWithdrawn };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function approveReapprovalAction(token: string): Promise<ChildResult> {
  try {
    const result = await approveReapproval(token, requestMeta(await headers()));
    return { ok: true, childFirstName: result.childFirstName };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function declineReapprovalAction(token: string): Promise<ChildResult> {
  try {
    const result = await declineReapproval(token, requestMeta(await headers()));
    return { ok: true, childFirstName: result.childFirstName };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    throw err;
  }
}
