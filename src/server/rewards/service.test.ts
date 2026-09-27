import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRewardById = vi.fn();
const mockInsertDraftReward = vi.fn();
const mockUpdateDraftReward = vi.fn();
const mockPublishRewardRow = vi.fn();
const mockUnpublishRewardRow = vi.fn();
const mockListAllRewards = vi.fn();
const mockListPublishedRewards = vi.fn();
const mockListRewardClaimsForUser = vi.fn();
const mockGetRewardClaimById = vi.fn();
const mockListRecentRewardClaims = vi.fn();
const mockClaimRewardTx = vi.fn();
vi.mock("./repo", () => ({
  getRewardById: (id: unknown) => mockGetRewardById(id),
  insertDraftReward: (input: unknown) => mockInsertDraftReward(input),
  updateDraftReward: (input: unknown) => mockUpdateDraftReward(input),
  publishRewardRow: (id: unknown, staffId: unknown) => mockPublishRewardRow(id, staffId),
  unpublishRewardRow: (id: unknown) => mockUnpublishRewardRow(id),
  listAllRewards: () => mockListAllRewards(),
  listPublishedRewards: () => mockListPublishedRewards(),
  listRewardClaimsForUser: (userId: unknown) => mockListRewardClaimsForUser(userId),
  getRewardClaimById: (id: unknown) => mockGetRewardClaimById(id),
  listRecentRewardClaims: (limit: unknown) => mockListRecentRewardClaims(limit),
  claimRewardTx: (input: unknown) => mockClaimRewardTx(input),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/redis", () => ({
  checkRateLimit: (id: unknown, config: unknown, failOpen: unknown) => mockCheckRateLimit(id, config, failOpen),
  REWARD_CLAIM_RATE_LIMIT: { requests: 10, window: "60 s", prefix: "ratelimit:reward-claim" },
}));

const mockCreditVmoneyRow = vi.fn();
vi.mock("@/server/economy/repo", () => ({
  creditVmoneyRow: (input: unknown) => mockCreditVmoneyRow(input),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

import { claimReward, publishReward, refundRewardClaim } from "./service";

const ACTOR = { id: "staff_1" };
const USER = { id: "user_1" };
const META = { ip: "1.2.3.4", userAgent: "test-agent" };

function rewardRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "reward_1",
    name: { en: "Dark Theme", hi: "x", hx: "x" },
    description: { en: "x", hi: "x", hx: "x" },
    category: "finlamma",
    priceVm: 500,
    iconKey: null,
    status: "published" as const,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("publishReward", () => {
  it("blocks publish and names every missing field when a language is blank", async () => {
    mockGetRewardById.mockResolvedValueOnce(
      rewardRow({ status: "draft", name: { en: "Dark Theme", hi: "", hx: "Dark Theme" } }),
    );

    await expect(publishReward(ACTOR, "reward_1", META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: { missingFields: ["name.hi"] },
    });
    expect(mockPublishRewardRow).not.toHaveBeenCalled();
  });
});

describe("claimReward", () => {
  it("fails CLOSED (RATE_LIMITED) when Redis can't be reached, never attempting the claim", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, configured: false });

    await expect(claimReward(USER, "reward_1", META)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(mockCheckRateLimit).toHaveBeenCalledWith(USER.id, expect.any(Object), false);
    expect(mockGetRewardById).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for a reward that doesn't exist or isn't published", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: true, configured: true });
    mockGetRewardById.mockResolvedValueOnce(rewardRow({ status: "draft" }));

    await expect(claimReward(USER, "reward_1", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockClaimRewardTx).not.toHaveBeenCalled();
  });

  it("throws INSUFFICIENT_VMONEY with the actual balance (floored to whole VM for display) when the claim is refused for that reason", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: true, configured: true });
    mockGetRewardById.mockResolvedValueOnce(rewardRow());
    mockClaimRewardTx.mockResolvedValueOnce({ status: "insufficient_balance", balancePaise: 20099 });

    await expect(claimReward(USER, "reward_1", META)).rejects.toMatchObject({
      code: "INSUFFICIENT_VMONEY",
      message: "Not enough V Money - this costs 500, you have 200",
      details: { priceVm: 500, balanceVm: 200, balancePaise: 20099 },
    });
  });

  it("claims successfully and logs", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: true, configured: true });
    mockGetRewardById.mockResolvedValueOnce(rewardRow());
    const claim = { id: "claim_1", pricePaid: 500, createdAt: new Date("2026-04-17T00:00:00.000Z") };
    mockClaimRewardTx.mockResolvedValueOnce({ status: "claimed", claim });

    const result = await claimReward(USER, "reward_1", META);

    expect(mockClaimRewardTx).toHaveBeenCalledWith({ userId: USER.id, rewardId: "reward_1", priceVm: 500 });
    expect(result).toEqual({
      rewardId: "reward_1",
      pricePaid: 500,
      alreadyClaimed: false,
      claimedAt: claim.createdAt,
    });
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "reward.claimed" }));
  });

  it("an already-claimed replay returns the same result without logging a second claim", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: true, configured: true });
    mockGetRewardById.mockResolvedValueOnce(rewardRow());
    const claim = { id: "claim_1", pricePaid: 500, createdAt: new Date("2026-04-17T00:00:00.000Z") };
    mockClaimRewardTx.mockResolvedValueOnce({ status: "already_claimed", claim });

    const result = await claimReward(USER, "reward_1", META);

    expect(result.alreadyClaimed).toBe(true);
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});

describe("refundRewardClaim", () => {
  it("throws NOT_FOUND for an unknown claim", async () => {
    mockGetRewardClaimById.mockResolvedValueOnce(null);

    await expect(refundRewardClaim(ACTOR, "claim_1", "customer request", META)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockCreditVmoneyRow).not.toHaveBeenCalled();
  });

  it("credits back the exact price paid, at multiplier 1, and logs with the reason", async () => {
    mockGetRewardClaimById.mockResolvedValueOnce({ id: "claim_1", userId: USER.id, rewardId: "reward_1", pricePaid: 500 });
    mockCreditVmoneyRow.mockResolvedValueOnce({ id: "ledger_1" });

    const result = await refundRewardClaim(ACTOR, "claim_1", "customer request", META);

    expect(mockCreditVmoneyRow).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER.id,
        sourceType: "reward_refund",
        sourceId: "claim_1",
        amountPaise: 50000,
        multiplierApplied: 1,
        ruleId: null,
      }),
    );
    expect(result).toEqual({ refunded: true });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "reward.refunded", metadata: expect.objectContaining({ reason: "customer request" }) }),
    );
  });

  it("is idempotent - refunding an already-refunded claim a second time is a silent no-op", async () => {
    mockGetRewardClaimById.mockResolvedValueOnce({ id: "claim_1", userId: USER.id, rewardId: "reward_1", pricePaid: 500 });
    mockCreditVmoneyRow.mockResolvedValueOnce(null); // conflict - already refunded

    const result = await refundRewardClaim(ACTOR, "claim_1", "customer request", META);

    expect(result).toEqual({ refunded: false });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});
