import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetFundByIdInternal = vi.fn();
vi.mock("@/server/funds/repo", () => ({
  getFundByIdInternal: (id: unknown) => mockGetFundByIdInternal(id),
}));

const mockIsTradingUnlocked = vi.fn();
vi.mock("@/server/worlds/service", () => ({
  isTradingUnlocked: (userId: unknown) => mockIsTradingUnlocked(userId),
}));

const mockCreateSipPlan = vi.fn();
const mockGetSipPlanForUser = vi.fn();
const mockListSipPlansForUser = vi.fn();
const mockPauseSipPlan = vi.fn();
const mockResumeSipPlan = vi.fn();
const mockCancelSipPlan = vi.fn();
const mockListRecentFundOrdersForSipPlan = vi.fn();
vi.mock("./sip-repo", () => ({
  createSipPlan: (...args: unknown[]) => mockCreateSipPlan(...args),
  getSipPlanForUser: (...args: unknown[]) => mockGetSipPlanForUser(...args),
  listSipPlansForUser: (...args: unknown[]) => mockListSipPlansForUser(...args),
  pauseSipPlan: (...args: unknown[]) => mockPauseSipPlan(...args),
  resumeSipPlan: (...args: unknown[]) => mockResumeSipPlan(...args),
  cancelSipPlan: (...args: unknown[]) => mockCancelSipPlan(...args),
  listRecentFundOrdersForSipPlan: (...args: unknown[]) => mockListRecentFundOrdersForSipPlan(...args),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

const { createSip, listMySips, updateSipPlanStatus } = await import("./sip-service");

const USER = { id: "user_1" };
const META = { ip: "1.2.3.4", userAgent: "test-agent" };
const FUND = { id: "fund_1", active: true, minLumpSumPaise: 10000, minSipPaise: 10000 };
const NOW = new Date("2026-09-25T05:00:00.000Z"); // 25th

function planRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "plan_1",
    userId: "user_1",
    fundId: "fund_1",
    amountPaise: 10000,
    dayOfMonth: 5,
    status: "active",
    pausedAt: null,
    cancelledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetFundByIdInternal.mockResolvedValue(FUND);
  mockIsTradingUnlocked.mockResolvedValue(true);
  mockListRecentFundOrdersForSipPlan.mockResolvedValue([]);
});

describe("createSip", () => {
  it("throws NOT_FOUND for an unknown or inactive fund", async () => {
    mockGetFundByIdInternal.mockResolvedValueOnce(null);
    await expect(createSip(USER, { fundId: "fund_1", amountPaise: 10000, dayOfMonth: 5 }, META, NOW)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockCreateSipPlan).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN when trading isn't unlocked", async () => {
    mockIsTradingUnlocked.mockResolvedValueOnce(false);
    await expect(createSip(USER, { fundId: "fund_1", amountPaise: 10000, dayOfMonth: 5 }, META, NOW)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws VALIDATION_FAILED below the fund's minimum SIP amount", async () => {
    mockGetFundByIdInternal.mockResolvedValueOnce({ ...FUND, minSipPaise: 50000 });
    await expect(createSip(USER, { fundId: "fund_1", amountPaise: 10000, dayOfMonth: 5 }, META, NOW)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("creates the plan, logs sip.created, and computes the next due date", async () => {
    mockCreateSipPlan.mockResolvedValueOnce(planRow());

    const result = await createSip(USER, { fundId: "fund_1", amountPaise: 10000, dayOfMonth: 5 }, META, NOW);

    expect(mockCreateSipPlan).toHaveBeenCalledWith("user_1", "fund_1", 10000, 5);
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "sip.created" }));
    // dayOfMonth (5) is before today (25) -> next due date rolls into next month
    expect(result.nextDueDate).toBe("2026-10-05");
  });
});

describe("next due date computation", () => {
  it("uses this month when dayOfMonth is today or later", async () => {
    mockCreateSipPlan.mockResolvedValueOnce(planRow({ dayOfMonth: 25 }));
    const result = await createSip(USER, { fundId: "fund_1", amountPaise: 10000, dayOfMonth: 25 }, META, NOW);
    expect(result.nextDueDate).toBe("2026-09-25");
  });

  it("rolls over the year boundary correctly (December -> January)", async () => {
    const decemberNow = new Date("2026-12-20T05:00:00.000Z");
    mockCreateSipPlan.mockResolvedValueOnce(planRow({ dayOfMonth: 5 }));
    const result = await createSip(USER, { fundId: "fund_1", amountPaise: 10000, dayOfMonth: 5 }, META, decemberNow);
    expect(result.nextDueDate).toBe("2027-01-05");
  });

  it("is null for a cancelled plan - it never runs again", async () => {
    mockListSipPlansForUser.mockResolvedValueOnce([planRow({ status: "cancelled" })]);
    const [result] = await listMySips("user_1", NOW);
    expect(result!.nextDueDate).toBeNull();
  });
});

describe("listMySips", () => {
  it("includes each plan's recent executions, including failures", async () => {
    mockListSipPlansForUser.mockResolvedValueOnce([planRow()]);
    mockListRecentFundOrdersForSipPlan.mockResolvedValueOnce([
      {
        id: "order_1",
        status: "failed",
        dueDate: "2026-08-05",
        amountPaise: null,
        unitsMilli: null,
        navPaise: null,
        navDate: null,
        failureReason: "INSUFFICIENT_MARGIN",
        createdAt: NOW,
      },
    ]);

    const [result] = await listMySips("user_1", NOW);

    expect(result!.recentExecutions).toHaveLength(1);
    expect(result!.recentExecutions[0]).toMatchObject({ status: "failed", failureReason: "INSUFFICIENT_MARGIN" });
  });
});

describe("updateSipPlanStatus", () => {
  it("throws NOT_FOUND for a plan the caller doesn't own", async () => {
    mockGetSipPlanForUser.mockResolvedValueOnce(null);
    await expect(updateSipPlanStatus(USER, "plan_1", "pause", META, NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CONFLICT when the action doesn't apply to the plan's current status", async () => {
    mockGetSipPlanForUser.mockResolvedValueOnce(planRow({ status: "cancelled" }));
    mockCancelSipPlan.mockResolvedValueOnce(null); // repo refuses - already cancelled

    await expect(updateSipPlanStatus(USER, "plan_1", "cancel", META, NOW)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("pauses an active plan and logs sip.paused", async () => {
    mockGetSipPlanForUser.mockResolvedValueOnce(planRow());
    mockPauseSipPlan.mockResolvedValueOnce(planRow({ status: "paused", pausedAt: NOW }));

    const result = await updateSipPlanStatus(USER, "plan_1", "pause", META, NOW);

    expect(result.status).toBe("paused");
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "sip.paused" }));
  });

  it("cancels a plan and logs sip.cancelled - cancellation is terminal", async () => {
    mockGetSipPlanForUser.mockResolvedValueOnce(planRow());
    mockCancelSipPlan.mockResolvedValueOnce(planRow({ status: "cancelled", cancelledAt: NOW }));

    const result = await updateSipPlanStatus(USER, "plan_1", "cancel", META, NOW);

    expect(result.status).toBe("cancelled");
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "sip.cancelled" }));
  });
});
