import { beforeEach, describe, expect, it, vi } from "vitest";

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
  getEntitlementsForUser: vi.fn(),
  recordWebhookEventIfNew: vi.fn(),
  upsertEntitlement: vi.fn(),
};
vi.mock("./repo", () => mockRepo);

const { getMyMonetisationStatus, processRevenueCatWebhookEvent, treatAsMinorForMonetisation } =
  await import("./service");

const USER = { id: "user-1" };

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    api_version: "1.0",
    event: {
      id: "evt-1",
      type: "RENEWAL",
      app_user_id: USER.id,
      expiration_at_ms: 1700000000000,
      entitlement_ids: ["ad_free"],
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRepo.recordWebhookEventIfNew.mockResolvedValue(true);
  mockRepo.findUserById.mockResolvedValue(USER);
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
      raw: expect.objectContaining({ id: "evt-1", type: "RENEWAL" }),
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
