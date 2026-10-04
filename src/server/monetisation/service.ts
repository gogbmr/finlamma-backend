import { logActivity } from "@/lib/activity-log";
import { logInternalError } from "@/lib/http";
import { getSettingJson } from "@/lib/settings";
import { isMinor } from "@/server/onboarding/service";
import { getLessonFlowScoringSettings } from "@/server/settings/service";
import { countLeadingClearedWorlds } from "@/server/worlds/service";
import { getRevenueCatProvider } from "./provider";
import {
  findUserById,
  getEntitlementsForUser,
  listEntitlementsNearExpiry,
  recordWebhookEventIfNew,
  upsertEntitlement,
} from "./repo";
import {
  ADS_SETTINGS_KEY,
  AdsSettingsSchema,
  DEFAULT_ADS_SETTINGS,
  ENTITLEMENT_KEYS,
  type EntitlementKey,
  RevenueCatWebhookPayloadSchema,
} from "./schemas";

// Checkpoint 4: the reconciliation job's scope - a RevenueCat-sourced
// entitlement whose expiresAt falls within this window around "now" gets a
// live RevenueCat lookup. 7 days back catches a renewal whose webhook was
// missed within the last week; 2 days ahead gives an about-to-expire row a
// second chance before its expiry actually takes effect, in case the
// RENEWAL webhook is delayed.
const RECONCILIATION_LOOKBACK_DAYS = 7;
const RECONCILIATION_LOOKAHEAD_DAYS = 2;

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

// Falls back to DEFAULT_ADS_SETTINGS if the row hasn't been seeded, or a
// stored value no longer matches the current shape - same "never hard-fail
// a learner's request over a settings_kv shape drift" reasoning
// getLessonFlowScoringSettings already follows.
export async function getAdsSettings() {
  const raw = await getSettingJson(ADS_SETTINGS_KEY);
  if (raw === null) return DEFAULT_ADS_SETTINGS;
  const parsed = AdsSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_ADS_SETTINGS;
}

// docs/ARCHITECTURE.md D66/D67: both the ad-personalization cutoff and the
// subscribe-eligibility gate use this exact same under-18 line, and both
// fail closed - a missing dateOfBirth (never self-correctable by the
// learner once set, but can simply not exist yet, e.g. mid-onboarding) is
// treated as a minor, never as an adult. One shared check so the two
// policies can never drift apart on what "unknown age" means.
export function treatAsMinorForMonetisation(dateOfBirth: string | null): boolean {
  if (!dateOfBirth) return true;
  return isMinor(dateOfBirth);
}

export async function getMyMonetisationStatus(user: { id: string; dateOfBirth: string | null }) {
  const [rows, adsSettings, scoringSettings] = await Promise.all([
    getEntitlementsForUser(user.id),
    getAdsSettings(),
    getLessonFlowScoringSettings(),
  ]);

  const now = new Date();
  const shapedEntitlements = rows.map((row) => ({
    entitlement: row.entitlement,
    source: row.source,
    active: row.expiresAt === null || row.expiresAt > now,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  }));
  const hasActiveAdFree = shapedEntitlements.some((e) => e.entitlement === "ad_free" && e.active);

  const { worldsToGo } = await countLeadingClearedWorlds(
    user.id,
    adsSettings.adsEnabledAfterWorldPosition,
    scoringSettings.bossQuizPassMarkPct,
  );
  const pastAdsWorldGate = worldsToGo === 0;

  const treatAsMinor = treatAsMinorForMonetisation(user.dateOfBirth);

  return {
    entitlements: shapedEntitlements,
    showAds: pastAdsWorldGate && !hasActiveAdFree,
    nonPersonalizedAdsRequired: treatAsMinor,
    canSubscribe: !treatAsMinor,
  };
}

// Daily Inngest job (src/inngest/functions/revenuecat-entitlement-
// reconciliation.ts). A webhook can be missed, delayed, or (rarely)
// redelivered out of an order our upsert-in-place model can't detect on
// its own - this re-fetches RevenueCat's own canonical state for every row
// within RECONCILIATION_LOOKBACK/LOOKAHEAD_DAYS of its expiry, so a missed
// webhook self-heals within a day instead of leaving stale ad-free status
// indefinitely. One bad lookup (a transient RevenueCat API error) never
// aborts the rest of the batch - logged and skipped, picked up again on
// the next run.
export async function reconcileEntitlementsNearExpiry(): Promise<{ checked: number; updated: number }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RECONCILIATION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + RECONCILIATION_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

  const rows = await listEntitlementsNearExpiry(windowStart, windowEnd);
  const provider = getRevenueCatProvider();

  let updated = 0;
  for (const row of rows) {
    let liveEntitlements;
    try {
      liveEntitlements = await provider.getSubscriberEntitlements(row.userId);
    } catch (err) {
      logInternalError("revenuecat_reconciliation_fetch_failed", err);
      continue;
    }

    const live = liveEntitlements.find((e) => e.entitlement === row.entitlement);
    if (!live) {
      // RevenueCat no longer reports this entitlement for this user at all
      // - possible app_user_id mismatch, or a genuinely stale local row.
      // Logged for visibility, left untouched rather than guessed at.
      logInternalError(
        "revenuecat_reconciliation_entitlement_missing",
        new Error("RevenueCat reports no record of this entitlement for this user"),
      );
      continue;
    }

    const currentExpiresAtMs = row.expiresAt?.getTime() ?? null;
    const liveExpiresAtMs = live.expiresAt?.getTime() ?? null;
    if (currentExpiresAtMs === liveExpiresAtMs) continue; // already in sync, no write needed

    await upsertEntitlement({
      userId: row.userId,
      entitlement: row.entitlement,
      source: "revenuecat",
      expiresAt: live.expiresAt,
      raw: { reconciledAt: now.toISOString(), previousExpiresAt: row.expiresAt?.toISOString() ?? null },
    });
    await logActivity({
      actorType: "system",
      action: "monetisation.entitlement_reconciled",
      targetType: "entitlements",
      targetId: row.userId,
      metadata: {
        entitlement: row.entitlement,
        previousExpiresAt: row.expiresAt?.toISOString() ?? null,
        newExpiresAt: live.expiresAt?.toISOString() ?? null,
      },
    });
    updated++;
  }

  return { checked: rows.length, updated };
}
