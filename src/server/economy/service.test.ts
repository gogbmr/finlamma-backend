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
  previewLessonReward,
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

    expect(result).toEqual({ credited: false, vmAwardedPaise: null });
    expect(mockGetRewardRule).not.toHaveBeenCalled();
    expect(mockCreditLessonCompletionRow).not.toHaveBeenCalled();
  });

  it("does not credit (and does not throw) when no reward rule exists for the kind", async () => {
    mockGetRewardRule.mockResolvedValueOnce(null);

    const result = await creditLessonCompletion(USER, LESSON, true, META);

    expect(result).toEqual({ credited: false, vmAwardedPaise: null });
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

    expect(result).toEqual({ credited: false, vmAwardedPaise: null });
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
      vmRow: { id: "vm_1", amountPaise: 4500 },
    });

    const result = await creditLessonCompletion(USER, LESSON, true, META);

    expect(result).toEqual({ credited: true, vmAwardedPaise: 4500 }); // App asks batch item A5
    expect(mockCreditLessonCompletionRow).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_1", sourceType: "lesson_completion", sourceId: "lesson_1", ruleId: "rule_1", amount: 20 }),
      expect.objectContaining({ amountPaise: 4500, multiplierApplied: 1.5 }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "economy.lesson_credited",
        metadata: expect.objectContaining({ activityKind: "video", xpAmount: 20, vmAmountPaise: 4500 }),
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
      vmRow: { id: "vm_1", amountPaise: 50000 },
    });

    await creditLessonCompletion(
      USER,
      { id: "lesson_1", kind: "video", xpOverride: 999, vmOverride: 500 },
      true,
      META,
    );

    expect(mockCreditLessonCompletionRow).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 999 }),
      expect.objectContaining({ amountPaise: 50000 }),
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

    expect(result).toEqual({ credited: false, vmAwardedPaise: null });
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

// Pinning suite (feat/lesson-meta-and-pass-flag): locks down exactly what
// creditLessonCompletion credits today, per lesson kind, BEFORE
// computeLessonReward/previewLessonReward are extracted out of it. This must
// pass unchanged both before and after that refactor - if it doesn't, the
// refactor silently changed real XP/VM math, which must never happen by even
// a single paisa (CLAUDE.md rule 2).
describe("creditLessonCompletion — reward pinning (must not change under refactor)", () => {
  const RULE_BY_KIND = {
    video: { id: "rule_video", activityKind: "video", defaultXp: 20, defaultVm: 30 },
    story: { id: "rule_story", activityKind: "story", defaultXp: 30, defaultVm: 45 },
    quiz: { id: "rule_quiz", activityKind: "quiz", defaultXp: 50, defaultVm: 90 },
    boss_quiz: { id: "rule_boss_quiz", activityKind: "boss_quiz", defaultXp: 120, defaultVm: 300 },
    role_play: { id: "rule_role_play", activityKind: "role_play", defaultXp: 40, defaultVm: 75 },
    doubt_zone: { id: "rule_ai_chat", activityKind: "ai_chat", defaultXp: 25, defaultVm: 60 },
  } as const;

  it.each(Object.keys(RULE_BY_KIND) as (keyof typeof RULE_BY_KIND)[])(
    "credits exactly the rule's defaultXp and defaultVm*100*multiplier paise for a passing %s lesson",
    async (kind) => {
      const rule = { ...RULE_BY_KIND[kind], active: true };
      mockGetRewardRule.mockResolvedValueOnce(rule);
      mockGetSettingNumber.mockResolvedValueOnce(1); // multiplier 1.0
      const expectedVmPaise = rule.defaultVm * 100;
      mockCreditLessonCompletionRow.mockResolvedValueOnce({
        xpRow: { id: "xp_1", amount: rule.defaultXp },
        vmRow: { id: "vm_1", amountPaise: expectedVmPaise },
      });

      const result = await creditLessonCompletion(
        USER,
        { id: "lesson_1", kind, xpOverride: null, vmOverride: null },
        true,
        META,
      );

      expect(result).toEqual({ credited: true, vmAwardedPaise: expectedVmPaise });
      expect(mockGetRewardRule).toHaveBeenCalledWith(rule.activityKind);
      expect(mockCreditLessonCompletionRow).toHaveBeenCalledWith(
        expect.objectContaining({ amount: rule.defaultXp }),
        expect.objectContaining({ amountPaise: expectedVmPaise, multiplierApplied: 1 }),
      );
    },
  );

  it("boss_quiz: a failed attempt (successful=false) credits nothing, regardless of the rule", async () => {
    const result = await creditLessonCompletion(
      USER,
      { id: "lesson_1", kind: "boss_quiz", xpOverride: null, vmOverride: null },
      false,
      META,
    );

    expect(result).toEqual({ credited: false, vmAwardedPaise: null });
    expect(mockGetRewardRule).not.toHaveBeenCalled();
    expect(mockCreditLessonCompletionRow).not.toHaveBeenCalled();
  });

  it("boss_quiz: a passing attempt credits the boss_quiz rule's exact defaults", async () => {
    const rule = { ...RULE_BY_KIND.boss_quiz, active: true };
    mockGetRewardRule.mockResolvedValueOnce(rule);
    mockGetSettingNumber.mockResolvedValueOnce(1);
    mockCreditLessonCompletionRow.mockResolvedValueOnce({
      xpRow: { id: "xp_1", amount: 120 },
      vmRow: { id: "vm_1", amountPaise: 30000 },
    });

    const result = await creditLessonCompletion(
      USER,
      { id: "lesson_1", kind: "boss_quiz", xpOverride: null, vmOverride: null },
      true,
      META,
    );

    expect(result).toEqual({ credited: true, vmAwardedPaise: 30000 });
    expect(mockCreditLessonCompletionRow).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 120 }),
      expect.objectContaining({ amountPaise: 30000, multiplierApplied: 1 }),
    );
  });

  it("a lesson's xpOverride/vmOverride wins over the rule's defaults, exactly", async () => {
    const rule = { ...RULE_BY_KIND.video, active: true };
    mockGetRewardRule.mockResolvedValueOnce(rule);
    mockGetSettingNumber.mockResolvedValueOnce(1);
    mockCreditLessonCompletionRow.mockResolvedValueOnce({
      xpRow: { id: "xp_1", amount: 999 },
      vmRow: { id: "vm_1", amountPaise: 50000 },
    });

    await creditLessonCompletion(
      USER,
      { id: "lesson_1", kind: "video", xpOverride: 999, vmOverride: 500 },
      true,
      META,
    );

    expect(mockCreditLessonCompletionRow).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 999 }),
      expect.objectContaining({ amountPaise: 50000, multiplierApplied: 1 }),
    );
  });

  it("scales VM (not XP) by a non-1.0 multiplier, exactly", async () => {
    const rule = { ...RULE_BY_KIND.video, active: true };
    mockGetRewardRule.mockResolvedValueOnce(rule);
    mockGetSettingNumber.mockResolvedValueOnce(1.5);
    mockCreditLessonCompletionRow.mockResolvedValueOnce({
      xpRow: { id: "xp_1", amount: 20 },
      vmRow: { id: "vm_1", amountPaise: 4500 },
    });

    await creditLessonCompletion(
      USER,
      { id: "lesson_1", kind: "video", xpOverride: null, vmOverride: null },
      true,
      META,
    );

    expect(mockCreditLessonCompletionRow).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 20 }),
      expect.objectContaining({ amountPaise: 4500, multiplierApplied: 1.5 }),
    );
  });
});

// Lesson-meta fields (GET /worlds/{id}/lessons, GET /lessons/{id}): proves
// previewLessonReward's numbers can never drift from what
// creditLessonCompletion would actually credit, since both go through the
// same computeLessonReward (not asserted directly - it's a private helper -
// but by construction the two functions share it, and this pins
// previewLessonReward's own output shape/math independently).
describe("previewLessonReward", () => {
  const videoRule = { id: "rule_video", activityKind: "video" as const, defaultXp: 20, defaultVm: 30, active: true };

  it("returns the rule's default XP/VM (scaled by the multiplier) for a lesson with no override", () => {
    const ruleByActivityKind = new Map([["video", videoRule]]);

    const result = previewLessonReward(
      { kind: "video", xpOverride: null, vmOverride: null },
      ruleByActivityKind,
      1.5,
    );

    expect(result).toEqual({ xpReward: 20, vmRewardPaise: 4500 });
  });

  it("uses the lesson's xpOverride/vmOverride instead of the rule's defaults", () => {
    const ruleByActivityKind = new Map([["video", videoRule]]);

    const result = previewLessonReward(
      { kind: "video", xpOverride: 999, vmOverride: 500 },
      ruleByActivityKind,
      1,
    );

    expect(result).toEqual({ xpReward: 999, vmRewardPaise: 50000 });
  });

  it("returns null when no reward rule exists for the kind", () => {
    const result = previewLessonReward({ kind: "video", xpOverride: null, vmOverride: null }, new Map(), 1);

    expect(result).toBeNull();
  });

  it("returns null when the reward rule is inactive", () => {
    const ruleByActivityKind = new Map([["video", { ...videoRule, active: false }]]);

    const result = previewLessonReward(
      { kind: "video", xpOverride: null, vmOverride: null },
      ruleByActivityKind,
      1,
    );

    expect(result).toBeNull();
  });

  it("maps doubt_zone lessons to the ai_chat rule, same as creditLessonCompletion", () => {
    const ruleByActivityKind = new Map([
      ["ai_chat", { id: "rule_ai_chat", activityKind: "ai_chat" as const, defaultXp: 25, defaultVm: 60, active: true }],
    ]);

    const result = previewLessonReward(
      { kind: "doubt_zone", xpOverride: null, vmOverride: null },
      ruleByActivityKind,
      1,
    );

    expect(result).toEqual({ xpReward: 25, vmRewardPaise: 6000 });
  });
});

describe("getVmoneyStats", () => {
  const AT = new Date("2026-01-10T00:00:00.000Z");

  it("a zero-activity user gets balance 0 and both weekly figures 0", async () => {
    mockSumVmoneyBalance.mockResolvedValueOnce(0);
    mockSumVmoneyEarnedSince.mockResolvedValueOnce(0);
    mockSumVmoneySpentSince.mockResolvedValueOnce(0);

    const stats = await getVmoneyStats(USER.id, AT);

    expect(stats).toEqual({ balancePaise: 0, weeklyEarnedPaise: 0, weeklySpentPaise: 0 });
  });

  it("combines balance, weekly earned and weekly spent from the ledger", async () => {
    mockSumVmoneyBalance.mockResolvedValueOnce(210);
    mockSumVmoneyEarnedSince.mockResolvedValueOnce(90);
    mockSumVmoneySpentSince.mockResolvedValueOnce(15);

    const stats = await getVmoneyStats(USER.id, AT);

    expect(stats).toEqual({ balancePaise: 210, weeklyEarnedPaise: 90, weeklySpentPaise: 15 });
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
    mockSumVmoneyEarnedSinceBySource.mockResolvedValueOnce([
      { sourceType: "lesson_completion", amountPaise: 300 },
    ]);

    const wallet = await getMyWallet(USER.id, new Date("2026-09-24T10:00:00.000Z"));

    expect(wallet).toEqual({
      balancePaise: 1250,
      earnedThisMonthPaise: 300,
      earnedBySource: [{ sourceType: "lesson_completion", amountPaise: 300 }],
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
