import { beforeEach, describe, expect, it, vi } from "vitest";

// processRevenueCatWebhookEvent's captureEvent call (docs/ARCHITECTURE.md
// D69) would otherwise pull in the real @/lib/analytics -> @/lib/env
// unmocked here.
vi.mock("@/lib/analytics", () => ({ captureEvent: vi.fn() }));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({ logActivity: (input: unknown) => mockLogActivity(input) }));

const mockLogInternalError = vi.fn();
vi.mock("@/lib/http", () => ({ logInternalError: (id: string, err: unknown) => mockLogInternalError(id, err) }));

const mockGetSettingJson = vi.fn();
vi.mock("@/lib/settings", () => ({ getSettingJson: (key: string) => mockGetSettingJson(key) }));

const mockIsMinor = vi.fn();
vi.mock("@/server/onboarding/service", () => ({ isMinor: (dob: string) => mockIsMinor(dob) }));

const mockGetLessonFlowScoringSettings = vi.fn();
vi.mock("@/server/settings/service", () => ({
  getLessonFlowScoringSettings: () => mockGetLessonFlowScoringSettings(),
}));

const mockCountLeadingClearedWorlds = vi.fn();
vi.mock("@/server/worlds/service", () => ({
  countLeadingClearedWorlds: (userId: string, position: number, passMark: number) =>
    mockCountLeadingClearedWorlds(userId, position, passMark),
}));

const mockRepo = {
  findUserById: vi.fn(),
  getEntitlement: vi.fn(),
  getEntitlementsForUser: vi.fn(),
  listEntitlementsNearExpiry: vi.fn(),
  recordWebhookEventIfNew: vi.fn(),
  upsertEntitlement: vi.fn(),
};
vi.mock("./repo", () => mockRepo);

const mockGetRevenueCatProvider = vi.fn();
vi.mock("./provider", () => ({ getRevenueCatProvider: () => mockGetRevenueCatProvider() }));

const {
  getMyMonetisationStatus,
  processRevenueCatWebhookEvent,
  reconcileEntitlementsNearExpiry,
  treatAsMinorForMonetisation,
} = await import("./service");

// An adult by default - /phase-audit 8's Critical finding was that the
// webhook granted entitlements with NO age check at all, so every "happy
// path" test below now exercises that check too (via mockIsMinor's default
// of `false`, set in the outer beforeEach) rather than bypassing it the way
// a dateOfBirth-less fixture used to.
const USER = { id: "user-1", dateOfBirth: "1990-01-01" };

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    api_version: "1.0",
    event: {
      id: "evt-1",
      type: "RENEWAL",
      app_user_id: USER.id,
      event_timestamp_ms: 1699999999000,
      expiration_at_ms: 1700000000000,
      entitlement_ids: ["ad_free"],
      store: "APP_STORE",
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRepo.recordWebhookEventIfNew.mockResolvedValue(true);
  mockRepo.findUserById.mockResolvedValue(USER);
  mockRepo.getEntitlement.mockResolvedValue(null); // no prior row - staleness check never fires
  mockIsMinor.mockReturnValue(false); // adult by default
});

describe("processRevenueCatWebhookEvent", () => {
  it("logs and returns on an unparsable payload shape, without touching the repo", async () => {
    await processRevenueCatWebhookEvent({ not: "a valid payload" });

    expect(mockLogInternalError).toHaveBeenCalledWith("revenuecat_webhook_unparsable", expect.anything());
    expect(mockRepo.recordWebhookEventIfNew).not.toHaveBeenCalled();
  });

  it("is a no-op on a replayed event id (RevenueCat retries reuse the same id)", async () => {
    mockRepo.recordWebhookEventIfNew.mockResolvedValueOnce(false);

    await processRevenueCatWebhookEvent(makePayload());

    expect(mockRepo.findUserById).not.toHaveBeenCalled();
    expect(mockRepo.upsertEntitlement).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("is a no-op when entitlement_ids doesn't include a known entitlement", async () => {
    await processRevenueCatWebhookEvent(makePayload({ entitlement_ids: ["some_other_entitlement"] }));

    expect(mockRepo.findUserById).not.toHaveBeenCalled();
    expect(mockRepo.upsertEntitlement).not.toHaveBeenCalled();
  });

  it("is a no-op when entitlement_ids is absent entirely", async () => {
    const payload = makePayload();
    delete (payload.event as Record<string, unknown>).entitlement_ids;

    await processRevenueCatWebhookEvent(payload);

    expect(mockRepo.upsertEntitlement).not.toHaveBeenCalled();
  });

  it("logs and returns when app_user_id matches no users row, without throwing", async () => {
    mockRepo.findUserById.mockResolvedValueOnce(null);

    await processRevenueCatWebhookEvent(makePayload());

    expect(mockLogInternalError).toHaveBeenCalledWith("revenuecat_webhook_unknown_user", expect.anything());
    expect(mockRepo.upsertEntitlement).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("upserts the entitlement and logs activity on a recognized, new event", async () => {
    await processRevenueCatWebhookEvent(makePayload());

    expect(mockRepo.upsertEntitlement).toHaveBeenCalledWith({
      userId: USER.id,
      entitlement: "ad_free",
      source: "revenuecat",
      expiresAt: new Date(1700000000000),
      // Allowlisted shape only (/phase-audit 8 fix) - never the full event
      // object (no price, no transaction/store ids, no subscriber attrs).
      raw: { eventId: "evt-1", eventType: "RENEWAL", eventTimestampMs: 1699999999000, store: "APP_STORE" },
    });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "system",
        action: "monetisation.entitlement_updated",
        targetType: "entitlements",
        targetId: USER.id,
        metadata: { entitlement: "ad_free", eventType: "RENEWAL", eventId: "evt-1" },
      }),
    );
  });

  it("stores a null expiresAt when the event carries no expiration (e.g. a lifetime grant)", async () => {
    await processRevenueCatWebhookEvent(makePayload({ expiration_at_ms: null }));

    expect(mockRepo.upsertEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: null }),
    );
  });

  it("stores null eventTimestampMs/store when the event doesn't carry them", async () => {
    await processRevenueCatWebhookEvent(makePayload({ event_timestamp_ms: undefined, store: undefined }));

    expect(mockRepo.upsertEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({ raw: expect.objectContaining({ eventTimestampMs: null, store: null }) }),
    );
  });

  describe("minor-blocking (docs/ARCHITECTURE.md D67, /phase-audit 8 Critical fix)", () => {
    it("blocks the grant for a known-minor account, records the attempt, and never upserts", async () => {
      mockIsMinor.mockReturnValueOnce(true);

      await processRevenueCatWebhookEvent(makePayload());

      expect(mockRepo.upsertEntitlement).not.toHaveBeenCalled();
      expect(mockLogInternalError).toHaveBeenCalledWith(
        "revenuecat_blocked_minor_entitlement",
        expect.anything(),
      );
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          actorType: "system",
          action: "monetisation.minor_purchase_blocked",
          targetType: "entitlements",
          targetId: USER.id,
          metadata: { entitlement: "ad_free", eventId: "evt-1", source: "webhook" },
        }),
      );
      // Nothing payment-related in the recorded attempt - no price, no
      // transaction id, no event type even.
      const blockedCall = mockLogActivity.mock.calls.find(
        (c) => c[0].action === "monetisation.minor_purchase_blocked",
      );
      expect(Object.keys(blockedCall![0].metadata)).toEqual(["entitlement", "eventId", "source"]);
    });

    it("blocks the grant when dateOfBirth is missing entirely - fails closed, never calls isMinor", async () => {
      mockRepo.findUserById.mockResolvedValueOnce({ id: USER.id, dateOfBirth: null });

      await processRevenueCatWebhookEvent(makePayload());

      expect(mockIsMinor).not.toHaveBeenCalled();
      expect(mockRepo.upsertEntitlement).not.toHaveBeenCalled();
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({ action: "monetisation.minor_purchase_blocked" }),
      );
    });

    it("a confirmed adult's grant proceeds normally (not every account is blocked)", async () => {
      mockIsMinor.mockReturnValueOnce(false);

      await processRevenueCatWebhookEvent(makePayload());

      expect(mockRepo.upsertEntitlement).toHaveBeenCalled();
      expect(mockLogActivity).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: "monetisation.minor_purchase_blocked" }),
      );
    });
  });

  describe("out-of-order delivery guard (/phase-audit 8 fix)", () => {
    it("ignores an older event when a newer one is already stored, and never overwrites", async () => {
      mockRepo.getEntitlement.mockResolvedValueOnce({
        raw: { eventId: "evt-0", eventType: "RENEWAL", eventTimestampMs: 1800000000000, store: "APP_STORE" },
      });

      // Default payload's event_timestamp_ms (1699999999000) is older than
      // the stored 1800000000000.
      await processRevenueCatWebhookEvent(makePayload());

      expect(mockRepo.upsertEntitlement).not.toHaveBeenCalled();
      expect(mockLogInternalError).toHaveBeenCalledWith(
        "revenuecat_webhook_stale_event_ignored",
        expect.anything(),
      );
    });

    it("applies a newer event over an older stored one normally", async () => {
      mockRepo.getEntitlement.mockResolvedValueOnce({
        raw: { eventId: "evt-0", eventType: "RENEWAL", eventTimestampMs: 1600000000000, store: "APP_STORE" },
      });

      await processRevenueCatWebhookEvent(makePayload());

      expect(mockRepo.upsertEntitlement).toHaveBeenCalled();
    });

    it("never skips when either side is missing a timestamp to compare", async () => {
      mockRepo.getEntitlement.mockResolvedValueOnce({ raw: { eventId: "evt-0", eventType: "RENEWAL" } });

      await processRevenueCatWebhookEvent(makePayload({ event_timestamp_ms: undefined }));

      expect(mockRepo.upsertEntitlement).toHaveBeenCalled();
    });
  });
});

describe("treatAsMinorForMonetisation", () => {
  it("fails closed to true when dateOfBirth is missing (docs/ARCHITECTURE.md D66)", () => {
    expect(treatAsMinorForMonetisation(null)).toBe(true);
    expect(mockIsMinor).not.toHaveBeenCalled();
  });

  it("delegates to isMinor when dateOfBirth is present", () => {
    mockIsMinor.mockReturnValueOnce(false);
    expect(treatAsMinorForMonetisation("2000-01-01")).toBe(false);
    expect(mockIsMinor).toHaveBeenCalledWith("2000-01-01");
  });
});

describe("getMyMonetisationStatus", () => {
  beforeEach(() => {
    mockGetSettingJson.mockResolvedValue(null); // falls back to DEFAULT_ADS_SETTINGS (position 3)
    mockGetLessonFlowScoringSettings.mockResolvedValue({ bossQuizPassMarkPct: 60 });
    mockRepo.getEntitlementsForUser.mockResolvedValue([]);
    mockCountLeadingClearedWorlds.mockResolvedValue({ cleared: 0, worldsToGo: 3 });
    mockIsMinor.mockReturnValue(true);
  });

  it("shows no ads before the configured world position is cleared, even with no entitlement", async () => {
    mockCountLeadingClearedWorlds.mockResolvedValueOnce({ cleared: 1, worldsToGo: 2 });

    const result = await getMyMonetisationStatus({ id: "user-1", dateOfBirth: "2000-01-01" });

    expect(result.showAds).toBe(false);
  });

  it("shows ads once the world position is cleared and there's no active ad_free entitlement", async () => {
    mockCountLeadingClearedWorlds.mockResolvedValueOnce({ cleared: 3, worldsToGo: 0 });

    const result = await getMyMonetisationStatus({ id: "user-1", dateOfBirth: "2000-01-01" });

    expect(result.showAds).toBe(true);
  });

  it("never shows ads to a user with an active ad_free entitlement, even past the world gate", async () => {
    mockCountLeadingClearedWorlds.mockResolvedValueOnce({ cleared: 3, worldsToGo: 0 });
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    mockRepo.getEntitlementsForUser.mockResolvedValueOnce([
      { entitlement: "ad_free", source: "revenuecat", expiresAt: future, raw: {} },
    ]);

    const result = await getMyMonetisationStatus({ id: "user-1", dateOfBirth: "2000-01-01" });

    expect(result.showAds).toBe(false);
    expect(result.entitlements).toEqual([
      { entitlement: "ad_free", source: "revenuecat", active: true, expiresAt: future.toISOString() },
    ]);
  });

  it("shows ads again once a stored ad_free entitlement has expired, past the world gate", async () => {
    mockCountLeadingClearedWorlds.mockResolvedValueOnce({ cleared: 3, worldsToGo: 0 });
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24);
    mockRepo.getEntitlementsForUser.mockResolvedValueOnce([
      { entitlement: "ad_free", source: "revenuecat", expiresAt: past, raw: {} },
    ]);

    const result = await getMyMonetisationStatus({ id: "user-1", dateOfBirth: "2000-01-01" });

    expect(result.showAds).toBe(true);
    expect(result.entitlements[0]?.active).toBe(false);
  });

  it("requires non-personalized ads and blocks subscribing for a minor", async () => {
    mockIsMinor.mockReturnValueOnce(true);

    const result = await getMyMonetisationStatus({ id: "user-1", dateOfBirth: "2015-01-01" });

    expect(result.nonPersonalizedAdsRequired).toBe(true);
    expect(result.canSubscribe).toBe(false);
  });

  it("allows personalized ads and subscribing for a confirmed adult", async () => {
    mockIsMinor.mockReturnValueOnce(false);

    const result = await getMyMonetisationStatus({ id: "user-1", dateOfBirth: "1990-01-01" });

    expect(result.nonPersonalizedAdsRequired).toBe(false);
    expect(result.canSubscribe).toBe(true);
  });

  it("fails closed (non-personalized, can't subscribe) when dateOfBirth is missing", async () => {
    const result = await getMyMonetisationStatus({ id: "user-1", dateOfBirth: null });

    expect(mockIsMinor).not.toHaveBeenCalled();
    expect(result.nonPersonalizedAdsRequired).toBe(true);
    expect(result.canSubscribe).toBe(false);
  });
});

describe("reconcileEntitlementsNearExpiry", () => {
  const mockProvider = { getSubscriberEntitlements: vi.fn() };

  beforeEach(() => {
    mockProvider.getSubscriberEntitlements.mockReset();
    mockGetRevenueCatProvider.mockReturnValue(mockProvider);
  });

  it("does nothing when no rows are near expiry", async () => {
    mockRepo.listEntitlementsNearExpiry.mockResolvedValueOnce([]);

    const result = await reconcileEntitlementsNearExpiry();

    expect(result).toEqual({ checked: 0, updated: 0 });
    expect(mockProvider.getSubscriberEntitlements).not.toHaveBeenCalled();
  });

  it("leaves a row untouched when RevenueCat's live state already matches", async () => {
    const expiresAt = new Date("2026-01-05T00:00:00Z");
    mockRepo.listEntitlementsNearExpiry.mockResolvedValueOnce([
      { userId: "user-1", entitlement: "ad_free", expiresAt },
    ]);
    mockProvider.getSubscriberEntitlements.mockResolvedValueOnce([{ entitlement: "ad_free", expiresAt }]);

    const result = await reconcileEntitlementsNearExpiry();

    expect(result).toEqual({ checked: 1, updated: 0 });
    expect(mockRepo.upsertEntitlement).not.toHaveBeenCalled();
  });

  it("updates a row when RevenueCat reports a renewal our webhook missed", async () => {
    const stale = new Date("2026-01-05T00:00:00Z");
    const renewed = new Date("2026-02-05T00:00:00Z");
    mockRepo.listEntitlementsNearExpiry.mockResolvedValueOnce([
      { userId: "user-1", entitlement: "ad_free", expiresAt: stale },
    ]);
    mockProvider.getSubscriberEntitlements.mockResolvedValueOnce([{ entitlement: "ad_free", expiresAt: renewed }]);

    const result = await reconcileEntitlementsNearExpiry();

    expect(result).toEqual({ checked: 1, updated: 1 });
    expect(mockRepo.upsertEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", entitlement: "ad_free", source: "revenuecat", expiresAt: renewed }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "monetisation.entitlement_reconciled", targetId: "user-1" }),
    );
  });

  it("logs and continues past a row RevenueCat no longer reports at all", async () => {
    mockRepo.listEntitlementsNearExpiry.mockResolvedValueOnce([
      { userId: "user-1", entitlement: "ad_free", expiresAt: new Date("2026-01-05T00:00:00Z") },
    ]);
    mockProvider.getSubscriberEntitlements.mockResolvedValueOnce([]);

    const result = await reconcileEntitlementsNearExpiry();

    expect(result).toEqual({ checked: 1, updated: 0 });
    expect(mockLogInternalError).toHaveBeenCalledWith(
      "revenuecat_reconciliation_entitlement_missing",
      expect.anything(),
    );
    expect(mockRepo.upsertEntitlement).not.toHaveBeenCalled();
  });

  it("logs a failed lookup and keeps processing the rest of the batch", async () => {
    mockRepo.listEntitlementsNearExpiry.mockResolvedValueOnce([
      { userId: "user-1", entitlement: "ad_free", expiresAt: new Date("2026-01-05T00:00:00Z") },
      { userId: "user-2", entitlement: "ad_free", expiresAt: new Date("2026-01-06T00:00:00Z") },
    ]);
    mockProvider.getSubscriberEntitlements
      .mockRejectedValueOnce(new Error("RevenueCat API down"))
      .mockResolvedValueOnce([{ entitlement: "ad_free", expiresAt: new Date("2026-03-01T00:00:00Z") }]);

    const result = await reconcileEntitlementsNearExpiry();

    expect(result).toEqual({ checked: 2, updated: 1 });
    expect(mockLogInternalError).toHaveBeenCalledWith("revenuecat_reconciliation_fetch_failed", expect.anything());
    expect(mockRepo.upsertEntitlement).toHaveBeenCalledTimes(1);
    expect(mockRepo.upsertEntitlement).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-2" }));
  });

  it("treats a both-null expiresAt (never-expiring on both sides) as already in sync", async () => {
    mockRepo.listEntitlementsNearExpiry.mockResolvedValueOnce([
      { userId: "user-1", entitlement: "ad_free", expiresAt: null },
    ]);
    mockProvider.getSubscriberEntitlements.mockResolvedValueOnce([{ entitlement: "ad_free", expiresAt: null }]);

    const result = await reconcileEntitlementsNearExpiry();

    expect(result).toEqual({ checked: 1, updated: 0 });
    expect(mockRepo.upsertEntitlement).not.toHaveBeenCalled();
  });

  describe("minor-blocking (/phase-audit 8: \"don't let the second path reintroduce the hole\")", () => {
    it("blocks a renewal for a known-minor account, records the attempt, and never upserts", async () => {
      const stale = new Date("2026-01-05T00:00:00Z");
      const renewed = new Date("2026-02-05T00:00:00Z");
      mockRepo.listEntitlementsNearExpiry.mockResolvedValueOnce([
        { userId: "user-1", entitlement: "ad_free", expiresAt: stale },
      ]);
      mockProvider.getSubscriberEntitlements.mockResolvedValueOnce([{ entitlement: "ad_free", expiresAt: renewed }]);
      mockRepo.findUserById.mockResolvedValueOnce({ id: "user-1", dateOfBirth: "2015-01-01" });
      mockIsMinor.mockReturnValueOnce(true);

      const result = await reconcileEntitlementsNearExpiry();

      expect(result).toEqual({ checked: 1, updated: 0 });
      expect(mockRepo.upsertEntitlement).not.toHaveBeenCalled();
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "monetisation.minor_purchase_blocked",
          targetId: "user-1",
          metadata: { entitlement: "ad_free", eventId: null, source: "reconciliation" },
        }),
      );
    });

    it("blocks a renewal when the stored entitlement's user now has no dateOfBirth on file - fails closed", async () => {
      const stale = new Date("2026-01-05T00:00:00Z");
      const renewed = new Date("2026-02-05T00:00:00Z");
      mockRepo.listEntitlementsNearExpiry.mockResolvedValueOnce([
        { userId: "user-1", entitlement: "ad_free", expiresAt: stale },
      ]);
      mockProvider.getSubscriberEntitlements.mockResolvedValueOnce([{ entitlement: "ad_free", expiresAt: renewed }]);
      mockRepo.findUserById.mockResolvedValueOnce({ id: "user-1", dateOfBirth: null });

      const result = await reconcileEntitlementsNearExpiry();

      expect(mockIsMinor).not.toHaveBeenCalled();
      expect(result).toEqual({ checked: 1, updated: 0 });
      expect(mockRepo.upsertEntitlement).not.toHaveBeenCalled();
    });

    it("logs and skips a row whose user no longer exists, without crashing the batch", async () => {
      const stale = new Date("2026-01-05T00:00:00Z");
      const renewed = new Date("2026-02-05T00:00:00Z");
      mockRepo.listEntitlementsNearExpiry.mockResolvedValueOnce([
        { userId: "user-1", entitlement: "ad_free", expiresAt: stale },
      ]);
      mockProvider.getSubscriberEntitlements.mockResolvedValueOnce([{ entitlement: "ad_free", expiresAt: renewed }]);
      mockRepo.findUserById.mockResolvedValueOnce(null);

      const result = await reconcileEntitlementsNearExpiry();

      expect(result).toEqual({ checked: 1, updated: 0 });
      expect(mockLogInternalError).toHaveBeenCalledWith(
        "revenuecat_reconciliation_unknown_user",
        expect.anything(),
      );
      expect(mockRepo.upsertEntitlement).not.toHaveBeenCalled();
    });

    it("still updates normally for a confirmed adult (the age check doesn't block everyone)", async () => {
      const stale = new Date("2026-01-05T00:00:00Z");
      const renewed = new Date("2026-02-05T00:00:00Z");
      mockRepo.listEntitlementsNearExpiry.mockResolvedValueOnce([
        { userId: "user-1", entitlement: "ad_free", expiresAt: stale },
      ]);
      mockProvider.getSubscriberEntitlements.mockResolvedValueOnce([{ entitlement: "ad_free", expiresAt: renewed }]);
      mockRepo.findUserById.mockResolvedValueOnce({ id: "user-1", dateOfBirth: "1990-01-01" });
      mockIsMinor.mockReturnValueOnce(false);

      const result = await reconcileEntitlementsNearExpiry();

      expect(result).toEqual({ checked: 1, updated: 1 });
      expect(mockRepo.upsertEntitlement).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }));
    });
  });
});
