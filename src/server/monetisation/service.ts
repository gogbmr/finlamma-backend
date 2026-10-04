import { logActivity } from "@/lib/activity-log";
import { logInternalError } from "@/lib/http";
import { findUserById, recordWebhookEventIfNew, upsertEntitlement } from "./repo";
import { ENTITLEMENT_KEYS, type EntitlementKey, RevenueCatWebhookPayloadSchema } from "./schemas";

const KNOWN_ENTITLEMENT_IDS = new Set<string>(ENTITLEMENT_KEYS);

// The only webhook entry point for RevenueCat (src/app/api/webhooks/
// revenuecat/route.ts). Deliberately never throws for anything short of a
// hard infra failure - every "this event doesn't apply" case (unparsable
// shape, an entitlement id we don't model, an app_user_id we don't
// recognize) logs and returns normally, so RevenueCat sees a clean 200 and
// never retries forever over a case that will never resolve differently.
export async function processRevenueCatWebhookEvent(rawPayload: unknown): Promise<void> {
  const parsed = RevenueCatWebhookPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    logInternalError(
      "revenuecat_webhook_unparsable",
      new Error("Unrecognized RevenueCat webhook payload shape"),
    );
    return;
  }
  const { event } = parsed.data;

  const isNewEvent = await recordWebhookEventIfNew("revenuecat", event.id);
  if (!isNewEvent) return;

  const entitlementId = event.entitlement_ids?.find((id) => KNOWN_ENTITLEMENT_IDS.has(id)) as
    | EntitlementKey
    | undefined;
  // Not an ad_free-related event (a different entitlement this app doesn't
  // have, or an event shape with no entitlement_ids at all, e.g.
  // TEMPORARY_ENTITLEMENT_GRANT) - nothing for this codebase to do with it.
  if (!entitlementId) return;

  // app_user_id must be our internal users.id - the mobile app's
  // RevenueCat SDK is configured with Purchases.configure({ appUserID:
  // <our uuid> }), a cross-repo contract this backend can't itself enforce.
  const user = await findUserById(event.app_user_id);
  if (!user) {
    logInternalError(
      "revenuecat_webhook_unknown_user",
      new Error("No users row for this webhook's app_user_id"),
    );
    return;
  }

  await upsertEntitlement({
    userId: user.id,
    entitlement: entitlementId,
    source: "revenuecat",
    expiresAt: event.expiration_at_ms != null ? new Date(event.expiration_at_ms) : null,
    raw: event as Record<string, unknown>,
  });

  await logActivity({
    actorType: "system",
    action: "monetisation.entitlement_updated",
    targetType: "entitlements",
    targetId: user.id,
    metadata: { entitlement: entitlementId, eventType: event.type, eventId: event.id },
  });
}
