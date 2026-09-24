import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSettingNumber = vi.fn();
const mockSetSettingJson = vi.fn();
vi.mock("@/lib/settings", () => ({
  getSettingNumber: (key: unknown, fallback: unknown) => mockGetSettingNumber(key, fallback),
  setSettingJson: (key: unknown, value: unknown, description?: unknown) =>
    mockSetSettingJson(key, value, description),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

const mockGetRewardRule = vi.fn();
const mockListRewardRules = vi.fn();
const mockUpdateRewardRule = vi.fn();
const mockCreditLessonCompletionRow = vi.fn();
const mockSumVmoneyBalance = vi.fn();
const mockSumVmoneyEarnedSince = vi.fn();
const mockSumVmoneyEarnedSinceBySource = vi.fn();
const mockSumVmoneySpentSince = vi.fn();
const mockListVmoneyLedgerForUser = vi.fn();
vi.mock("./repo", () => ({
  getRewardRule: (kind: unknown) => mockGetRewardRule(kind),
  listRewardRules: () => mockListRewardRules(),
  updateRewardRule: (kind: unknown, input: unknown) => mockUpdateRewardRule(kind, input),
  creditLessonCompletionRow: (xp: unknown, vm: unknown) => mockCreditLessonCompletionRow(xp, vm),
  sumVmoneyBalance: (userId: unknown) => mockSumVmoneyBalance(userId),
  sumVmoneyEarnedSince: (userId: unknown, since: unknown) => mockSumVmoneyEarnedSince(userId, since),
  sumVmoneyEarnedSinceBySource: (userId: unknown, since: unknown) =>
    mockSumVmoneyEarnedSinceBySource(userId, since),
  sumVmoneySpentSince: (userId: unknown, since: unknown) => mockSumVmoneySpentSince(userId, since),
  listVmoneyLedgerForUser: (userId: unknown, opts: unknown) => mockListVmoneyLedgerForUser(userId, opts),
}));

const mockRecordLearningActivity = vi.fn();
vi.mock("@/server/streaks/service", () => ({
  recordLearningActivity: (userId: unknown) => mockRecordLearningActivity(userId),
}));

import { AppError } from "@/lib/errors";
import {
  activityKindForLessonKind,
  creditLessonCompletion,
  getMyWallet,
  getMyWalletHistory,
  getVmIssuanceMultiplier,
  getVmoneyStats,
  updateRewardRuleForAdmin,
  updateVmIssuanceMultiplier,
} from "./service";
import { DEFAULT_VM_ISSUANCE_MULTIPLIER, VM_ISSUANCE_MULTIPLIER_SETTINGS_KEY } from "./schemas";

const ACTOR = { id: "staff_1" };
const USER = { id: "user_1" };
const META = { ip: "1.2.3.4", userAgent: "test-agent" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("activityKindForLessonKind", () => {
  it.each([
    ["video", "video"],
    ["story", "story"],
    ["doubt_zone", "ai_chat"],
    ["role_play", "role_play"],
    ["quiz", "quiz"],
    ["boss_quiz", "boss_quiz"],
  ] as const)("maps lesson kind %s to activity kind %s", (lessonKind, activityKind) => {
    expect(activityKindForLessonKind(lessonKind)).toBe(activityKind);
  });

  it("throws VALIDATION_FAILED for an unknown lesson kind", () => {
    expect(() => activityKindForLessonKind("not_a_real_kind")).toThrow(AppError);
  });
});

describe("getVmIssuanceMultiplier", () => {
  it("reads the settings_kv value", async () => {
    mockGetSettingNumber.mockResolvedValueOnce(1.5);

    expect(await getVmIssuanceMultiplier()).toBe(1.5);
    expect(mockGetSettingNumber).toHaveBeenCalledWith(
      VM_ISSUANCE_MULTIPLIER_SETTINGS_KEY,
      DEFAULT_VM_ISSUANCE_MULTIPLIER,
    );
  });
});

describe("updateVmIssuanceMultiplier", () => {
  it("writes the new value and logs the change with before/after", async () => {
    mockGetSettingNumber.mockResolvedValueOnce(1.0);

    const result = await updateVmIssuanceMultiplier(ACTOR, 1.25, META);

    expect(result).toBe(1.25);
    expect(mockSetSettingJson).toHaveBeenCalledWith(
      VM_ISSUANCE_MULTIPLIER_SETTINGS_KEY,
      1.25,
      expect.any(String),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "staff",
        actorId: "staff_1",
        action: "economy.vm_multiplier_updated",
        metadata: { previous: 1.0, next: 1.25 },
      }),
    );
  });
});

describe("updateRewardRuleForAdmin", () => {
  it("throws NOT_FOUND when no rule exists for the kind", async () => {
    mockGetRewardRule.mockResolvedValueOnce(null);

    await expect(
      updateRewardRuleForAdmin(ACTOR, "video", { defaultXp: 20, defaultVm: 30, active: true }, META),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockUpdateRewardRule).not.toHaveBeenCalled();
  });

  it("updates and logs before/after", async () => {
    mockGetRewardRule.mockResolvedValueOnce({
      id: "rule_1",
      activityKind: "video",
      defaultXp: 20,
      defaultVm: 30,
      active: true,
    });
    mockUpdateRewardRule.mockResolvedValueOnce({
      id: "rule_1",
      activityKind: "video",
      defaultXp: 25,
      defaultVm: 35,
      active: true,
    });

    const result = await updateRewardRuleForAdmin(
      ACTOR,
      "video",
      { defaultXp: 25, defaultVm: 35, active: true },
      META,
    );

    expect(result?.defaultXp).toBe(25);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "economy.reward_rule_updated",
        metadata: {
          previous: { defaultXp: 20, defaultVm: 30, active: true },
          next: { defaultXp: 25, defaultVm: 35, active: true },
        },
      }),
    );
  });
});

describe("creditLessonCompletion", () => {
  const LESSON = { id: "lesson_1", kind: "video", xpOverride: null, vmOverride: null };

  it("does not credit when successful is false", async () => {
    const result = await creditLessonCompletion(USER, LESSON, false, META);

    expect(result).toEqual({ credited: false });
    expect(mockGetRewardRule).not.toHaveBeenCalled();
    expect(mockCreditLessonCompletionRow).not.toHaveBeenCalled();
  });

  it("does not credit (and does not throw) when no reward rule exists for the kind", async () => {
    mockGetRewardRule.mockResolvedValueOnce(null);

    const result = await creditLessonCompletion(USER, LESSON, true, META);

    expect(result).toEqual({ credited: false });
    expect(mockCreditLessonCompletionRow).not.toHaveBeenCalled();
  });

  it("does not credit when the reward rule is inactive", async () => {
    mockGetRewardRule.mockResolvedValueOnce({
      id: "rule_1",
      activityKind: "video",
      defaultXp: 20,
      defaultVm: 30,
      active: false,
    });

    const result = await creditLessonCompletion(USER, LESSON, true, META);

    expect(result).toEqual({ credited: false });
    expect(mockCreditLessonCompletionRow).not.toHaveBeenCalled();
  });

  it("credits the rule's default XP/VM, scaled by the current multiplier", async () => {
    mockGetRewardRule.mockResolvedValueOnce({
      id: "rule_1",
      activityKind: "video",
      defaultXp: 20,
      defaultVm: 30,
      active: true,
    });
    mockGetSettingNumber.mockResolvedValueOnce(1.5);
    mockCreditLessonCompletionRow.mockResolvedValueOnce({
      xpRow: { id: "xp_1", amount: 20 },
      vmRow: { id: "vm_1", amount: 45 },
    });

    const result = await creditLessonCompletion(USER, LESSON, true, META);

    expect(result).toEqual({ credited: true });
    expect(mockCreditLessonCompletionRow).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_1", sourceType: "lesson_completion", sourceId: "lesson_1", ruleId: "rule_1", amount: 20 }),
      expect.objectContaining({ amount: 45, multiplierApplied: 1.5 }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "economy.lesson_credited",
        metadata: expect.objectContaining({ activityKind: "video", xpAmount: 20, vmAmount: 45 }),
      }),
    );
    // docs/ECONOMY.md decision 5: a real credit is exactly what "activity"
    // means for the learning streak.
    expect(mockRecordLearningActivity).toHaveBeenCalledWith("user_1");
  });

  it("uses the lesson's xpOverride/vmOverride instead of the rule's defaults when set", async () => {
    mockGetRewardRule.mockResolvedValueOnce({
      id: "rule_1",
      activityKind: "video",
      defaultXp: 20,
      defaultVm: 30,
      active: true,
    });
    mockGetSettingNumber.mockResolvedValueOnce(1);
    mockCreditLessonCompletionRow.mockResolvedValueOnce({
      xpRow: { id: "xp_1", amount: 999 },
      vmRow: { id: "vm_1", amount: 500 },
    });

    await creditLessonCompletion(
      USER,
      { id: "lesson_1", kind: "video", xpOverride: 999, vmOverride: 500 },
      true,
      META,
    );

    expect(mockCreditLessonCompletionRow).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 999 }),
      expect.objectContaining({ amount: 500 }),
    );
  });

  it("does not log activity when the repo reports it was already credited (idempotent replay)", async () => {
    mockGetRewardRule.mockResolvedValueOnce({
      id: "rule_1",
      activityKind: "video",
      defaultXp: 20,
      defaultVm: 30,
      active: true,
    });
    mockGetSettingNumber.mockResolvedValueOnce(1);
    mockCreditLessonCompletionRow.mockResolvedValueOnce({ xpRow: null, vmRow: null });

    const result = await creditLessonCompletion(USER, LESSON, true, META);

    expect(result).toEqual({ credited: false });
    expect(mockLogActivity).not.toHaveBeenCalled();
    expect(mockRecordLearningActivity).not.toHaveBeenCalled();
  });

  it("maps doubt_zone lessons to the ai_chat reward rule", async () => {
    mockGetRewardRule.mockResolvedValueOnce({
      id: "rule_ai_chat",
      activityKind: "ai_chat",
      defaultXp: 25,
      defaultVm: 60,
      active: true,
    });
    mockGetSettingNumber.mockResolvedValueOnce(1);
    mockCreditLessonCompletionRow.mockResolvedValueOnce({
      xpRow: { id: "xp_1", amount: 25 },
      vmRow: { id: "vm_1", amount: 60 },
    });

    await creditLessonCompletion(
      USER,
      { id: "lesson_1", kind: "doubt_zone", xpOverride: null, vmOverride: null },
      true,
      META,
    );

    expect(mockGetRewardRule).toHaveBeenCalledWith("ai_chat");
  });
});

describe("getVmoneyStats", () => {
  const AT = new Date("2026-01-10T00:00:00.000Z");

  it("a zero-activity user gets balance 0 and both weekly figures 0", async () => {
    mockSumVmoneyBalance.mockResolvedValueOnce(0);
    mockSumVmoneyEarnedSince.mockResolvedValueOnce(0);
    mockSumVmoneySpentSince.mockResolvedValueOnce(0);

    const stats = await getVmoneyStats(USER.id, AT);

    expect(stats).toEqual({ balance: 0, weeklyEarned: 0, weeklySpent: 0 });
  });

  it("combines balance, weekly earned and weekly spent from the ledger", async () => {
    mockSumVmoneyBalance.mockResolvedValueOnce(210);
    mockSumVmoneyEarnedSince.mockResolvedValueOnce(90);
    mockSumVmoneySpentSince.mockResolvedValueOnce(15);

    const stats = await getVmoneyStats(USER.id, AT);

    expect(stats).toEqual({ balance: 210, weeklyEarned: 90, weeklySpent: 15 });
  });

  it("passes a since-date exactly 7 days before `at` to both weekly sums", async () => {
    mockSumVmoneyBalance.mockResolvedValueOnce(0);
    mockSumVmoneyEarnedSince.mockResolvedValueOnce(0);
    mockSumVmoneySpentSince.mockResolvedValueOnce(0);

    await getVmoneyStats(USER.id, AT);

    const expectedSince = new Date("2026-01-03T00:00:00.000Z");
    expect(mockSumVmoneyEarnedSince).toHaveBeenCalledWith(USER.id, expectedSince);
    expect(mockSumVmoneySpentSince).toHaveBeenCalledWith(USER.id, expectedSince);
  });
});

describe("getMyWallet", () => {
  it("combines balance, VM earned this IST month, and the earn-source breakdown", async () => {
    mockSumVmoneyBalance.mockResolvedValueOnce(1250);
    mockSumVmoneyEarnedSince.mockResolvedValueOnce(300);
    mockSumVmoneyEarnedSinceBySource.mockResolvedValueOnce([{ sourceType: "lesson_completion", amount: 300 }]);

    const wallet = await getMyWallet(USER.id, new Date("2026-09-24T10:00:00.000Z"));

    expect(wallet).toEqual({
      balance: 1250,
      earnedThisMonth: 300,
      earnedBySource: [{ sourceType: "lesson_completion", amount: 300 }],
    });
  });
});

describe("getMyWalletHistory", () => {
  it("decodes the cursor and forwards it with the limit", async () => {
    const cursor = Buffer.from(JSON.stringify({ createdAt: "2026-01-01T00:00:00.000Z", id: "row_1" })).toString(
      "base64url",
    );
    mockListVmoneyLedgerForUser.mockResolvedValueOnce({ data: [], nextCursor: null });

    await getMyWalletHistory(USER.id, { limit: 20, cursor });

    expect(mockListVmoneyLedgerForUser).toHaveBeenCalledWith(USER.id, {
      limit: 20,
      cursor: { createdAt: "2026-01-01T00:00:00.000Z", id: "row_1" },
    });
  });

  it("passes a null cursor through when none is given", async () => {
    mockListVmoneyLedgerForUser.mockResolvedValueOnce({ data: [], nextCursor: null });

    await getMyWalletHistory(USER.id, { limit: 20, cursor: null });

    expect(mockListVmoneyLedgerForUser).toHaveBeenCalledWith(USER.id, { limit: 20, cursor: null });
  });
});
