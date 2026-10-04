import { env } from "@/lib/env";
import { ENTITLEMENT_KEYS, type EntitlementKey } from "../schemas";
import type { RevenueCatProvider, RevenueCatSubscriberEntitlement } from "../types";

// https://www.revenuecat.com/docs/api-v1 - "Authentication is performed
// using an Authorization header with a Bearer token containing ... a
// secret API key." Base URL confirmed against the same doc, not guessed.
const BASE_URL = "https://api.revenuecat.com/v1";

const KNOWN_ENTITLEMENT_IDS = new Set<string>(ENTITLEMENT_KEYS);

// RevenueCat's actual response shape (https://www.revenuecat.com/docs/api-v1/customer-info-model)
// - `entitlements` is a dict keyed by entitlement identifier, covering
// every entitlement ever granted to this subscriber (active, expired, or
// never-expiring), not just currently-active ones. Only the fields this
// codebase reads are modeled.
type RevenueCatSubscriberResponse = {
  subscriber?: {
    entitlements?: Record<string, { expires_date: string | null }>;
  };
};

// GET /subscribers/{app_user_id} "retrieves the latest Customer Info ...
// or creates a new customer record if one does not exist" - calling this
// for a user who genuinely has no RevenueCat history (shouldn't happen,
// since the reconciliation job only ever calls this for rows that already
// have an entitlements row from a real webhook) would create a phantom
// subscriber on RevenueCat's side, same as the mobile SDK's own first-launch
// behavior - not a concern for the ids this job actually passes in.
export class RealRevenueCatProvider implements RevenueCatProvider {
  async getSubscriberEntitlements(appUserId: string): Promise<RevenueCatSubscriberEntitlement[]> {
    const apiKey = env.REVENUECAT_SECRET_API_KEY;
    if (!apiKey) {
      throw new Error("REVENUECAT_SECRET_API_KEY not configured");
    }

    const res = await fetch(`${BASE_URL}/subscribers/${encodeURIComponent(appUserId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      throw new Error(`RevenueCat subscriber lookup failed: HTTP ${res.status}`);
    }

    const body = (await res.json()) as RevenueCatSubscriberResponse;
    const entitlements = body.subscriber?.entitlements ?? {};

    const result: RevenueCatSubscriberEntitlement[] = [];
    for (const [key, value] of Object.entries(entitlements)) {
      if (!KNOWN_ENTITLEMENT_IDS.has(key)) continue; // an entitlement this app doesn't model
      result.push({
        entitlement: key as EntitlementKey,
        expiresAt: value.expires_date ? new Date(value.expires_date) : null,
      });
    }
    return result;
  }
}
