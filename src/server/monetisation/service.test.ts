import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({ logActivity: (input: unknown) => mockLogActivity(input) }));

const mockLogInternalError = vi.fn();
vi.mock("@/lib/http", () => ({ logInternalError: (id: string, err: unknown) => mockLogInternalError(id, err) }));

const mockRepo = {
  findUserById: vi.fn(),
  recordWebhookEventIfNew: vi.fn(),
  upsertEntitlement: vi.fn(),
};
vi.mock("./repo", () => mockRepo);

const { processRevenueCatWebhookEvent } = await import("./service");

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
