import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireStaff = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireStaff: (permission: unknown) => mockRequireStaff(permission),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (path: unknown) => mockRevalidatePath(path),
}));

const mockCreateRewardDraft = vi.fn();
const mockUpdateRewardDraft = vi.fn();
const mockPublishReward = vi.fn();
const mockUnpublishReward = vi.fn();
const mockRefundRewardClaim = vi.fn();
vi.mock("@/server/rewards/service", () => ({
  createRewardDraft: (actor: unknown, input: unknown, meta: unknown) => mockCreateRewardDraft(actor, input, meta),
  updateRewardDraft: (actor: unknown, input: unknown, meta: unknown) => mockUpdateRewardDraft(actor, input, meta),
  publishReward: (actor: unknown, id: unknown, meta: unknown) => mockPublishReward(actor, id, meta),
  unpublishReward: (actor: unknown, id: unknown, meta: unknown) => mockUnpublishReward(actor, id, meta),
  refundRewardClaim: (actor: unknown, claimId: unknown, reason: unknown, meta: unknown) =>
    mockRefundRewardClaim(actor, claimId, reason, meta),
}));

import {
  createRewardDraftAction,
  publishRewardAction,
  refundRewardClaimAction,
  unpublishRewardAction,
  updateRewardDraftAction,
} from "./actions";

const ACTOR = { id: "staff_1" };
const REWARD_ID = "b3b6c6f0-8f2a-4b8b-9f0a-2b8b8b8b8b8b";
const CLAIM_ID = "c3c6c6f0-8f2a-4b8b-9f0a-2b8b8b8b8b8b";
const VALID_INPUT = {
  name: { en: "Dark Theme", hi: "x", hx: "x" },
  description: { en: "x", hi: "x", hx: "x" },
  category: "finlamma",
  priceVm: 500,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("wrong role is rejected", () => {
  it("createRewardDraftAction requires economy.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: economy.manage"));

    const result = await createRewardDraftAction(VALID_INPUT);

    expect(result).toEqual({ ok: false, error: "Missing permission: economy.manage" });
    expect(mockCreateRewardDraft).not.toHaveBeenCalled();
  });

  it("refundRewardClaimAction requires economy.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: economy.manage"));

    const result = await refundRewardClaimAction({ claimId: CLAIM_ID, reason: "customer request" });

    expect(result).toEqual({ ok: false, error: "Missing permission: economy.manage" });
    expect(mockRefundRewardClaim).not.toHaveBeenCalled();
  });
});

describe("happy path", () => {
  beforeEach(() => {
    mockRequireStaff.mockResolvedValue(ACTOR);
  });

  it("createRewardDraftAction creates and revalidates", async () => {
    mockCreateRewardDraft.mockResolvedValueOnce({ id: "reward_1" });

    const result = await createRewardDraftAction(VALID_INPUT);

    expect(result).toEqual({ ok: true });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/rewards");
  });

  it("createRewardDraftAction rejects a price above the max without calling the service", async () => {
    const result = await createRewardDraftAction({ ...VALID_INPUT, priceVm: 1_000_000 });

    expect(result.ok).toBe(false);
    expect(mockCreateRewardDraft).not.toHaveBeenCalled();
  });

  it("updateRewardDraftAction updates and revalidates", async () => {
    mockUpdateRewardDraft.mockResolvedValueOnce({ id: REWARD_ID });

    const result = await updateRewardDraftAction({ id: REWARD_ID, ...VALID_INPUT });

    expect(result).toEqual({ ok: true });
  });

  it("publishRewardAction publishes and revalidates", async () => {
    mockPublishReward.mockResolvedValueOnce({ id: REWARD_ID, status: "published" });

    const result = await publishRewardAction({ id: REWARD_ID });

    expect(result).toEqual({ ok: true });
  });

  it("unpublishRewardAction unpublishes and revalidates", async () => {
    mockUnpublishReward.mockResolvedValueOnce({ id: REWARD_ID, status: "draft" });

    const result = await unpublishRewardAction({ id: REWARD_ID });

    expect(result).toEqual({ ok: true });
  });

  it("refundRewardClaimAction rejects an empty reason without calling the service", async () => {
    const result = await refundRewardClaimAction({ claimId: CLAIM_ID, reason: "" });

    expect(result.ok).toBe(false);
    expect(mockRefundRewardClaim).not.toHaveBeenCalled();
  });

  it("refundRewardClaimAction refunds and revalidates", async () => {
    mockRefundRewardClaim.mockResolvedValueOnce({ refunded: true });

    const result = await refundRewardClaimAction({ claimId: CLAIM_ID, reason: "customer request" });

    expect(result).toEqual({ ok: true });
    expect(mockRefundRewardClaim).toHaveBeenCalledWith(ACTOR, CLAIM_ID, "customer request", expect.any(Object));
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/rewards");
  });
});
