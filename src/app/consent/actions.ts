"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import {
  approveReapproval,
  confirmParentConsent,
  declineParentConsent,
  declineReapproval,
  unsubscribeWeeklyReport,
  withdrawParentConsent,
} from "@/server/onboarding/service";

// A Server Action is a real, directly-callable HTTP endpoint - Next.js's
// wire protocol doesn't enforce a parameter's TS type at runtime, so a
// crafted request could send anything in this argument's place. `.catch(false)`
// coerces anything that isn't literally a boolean to the safe default
// (opted out) rather than throwing - matches the "unticked by default"
// design (docs/ARCHITECTURE.md D35) instead of erroring the whole action out
// over a malformed opt-in flag.
const WeeklyReportOptInSchema = z.boolean().catch(false);

type ChildResult = { ok: true; childFirstName: string } | { ok: false; error: string };
type WithdrawResult =
  | { ok: true; childFirstName: string; alreadyWithdrawn: boolean }
  | { ok: false; error: string };
type UnsubscribeResult =
  | { ok: true; childFirstName: string; alreadyUnsubscribed: boolean }
  | { ok: false; error: string };

// Public - no requireUser/requireStaff. The token itself is the only
// credential (see docs/PRODUCT_SPEC.md's Onboarding & parental consent
// section): a parent has no Finlamma account to authenticate with. Never
// called on page render (GET) - only from an actual button press, per the
// GET-must-be-side-effect-free rule (email security scanners prefetch
// links).
// weeklyReportOptIn is the parent's separate, unticked-by-default checkbox
// choice (D33) - it never gates whether consent itself succeeds.
export async function confirmParentConsentAction(
  token: string,
  weeklyReportOptIn: unknown = false,
): Promise<ChildResult> {
  try {
    const optIn = WeeklyReportOptInSchema.parse(weeklyReportOptIn);
    const result = await confirmParentConsent(token, requestMeta(await headers()), optIn);
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

// weeklyReportOptIn here is additive-only (see approveReapproval's comment):
// checking it turns the weekly email on, leaving it unchecked never turns an
// existing opt-in off.
export async function approveReapprovalAction(
  token: string,
  weeklyReportOptIn: unknown = false,
): Promise<ChildResult> {
  try {
    const optIn = WeeklyReportOptInSchema.parse(weeklyReportOptIn);
    const result = await approveReapproval(token, requestMeta(await headers()), optIn);
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

// Public - same "token is the only credential" reasoning as every other
// action here. Stops ONLY the weekly report email; never touches consent.
export async function unsubscribeWeeklyReportAction(token: string): Promise<UnsubscribeResult> {
  try {
    const result = await unsubscribeWeeklyReport(token, requestMeta(await headers()));
    return { ok: true, childFirstName: result.childFirstName, alreadyUnsubscribed: result.alreadyUnsubscribed };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    throw err;
  }
}
