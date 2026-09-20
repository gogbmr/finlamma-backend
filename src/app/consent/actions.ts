"use server";

import { headers } from "next/headers";
import { AppError } from "@/lib/errors";
import { requestMeta } from "@/lib/http";
import { confirmParentConsent } from "@/server/onboarding/service";

type ConfirmResult = { ok: true; childFirstName: string } | { ok: false; error: string };

// Public - no requireUser/requireStaff. The token itself is the only
// credential (see docs/PRODUCT_SPEC.md's Onboarding & parental consent
// section): a parent has no Finlamma account to authenticate with. Never
// called on page render (GET) - only from the page's "I consent" button, a
// deliberate user action, per the GET-must-be-side-effect-free rule (email
// security scanners prefetch links).
export async function confirmParentConsentAction(token: string): Promise<ConfirmResult> {
  try {
    const result = await confirmParentConsent(token, requestMeta(await headers()));
    return { ok: true, childFirstName: result.childFirstName };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    throw err;
  }
}
