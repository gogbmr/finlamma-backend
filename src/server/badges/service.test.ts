import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetBadgeById = vi.fn();
const mockInsertDraftBadge = vi.fn();
const mockUpdateDraftBadge = vi.fn();
const mockPublishBadgeRow = vi.fn();
const mockUnpublishBadgeRow = vi.fn();
const mockListAllBadges = vi.fn();
const mockListPublishedBadges = vi.fn();
const mockListUnlockedBadgeIdsForUser = vi.fn();
const mockListUserBadgesForUser = vi.fn();
const mockInsertUserBadgeIfAbsent = vi.fn();
vi.mock("./repo", () => ({
  getBadgeById: (id: unknown) => mockGetBadgeById(id),
  insertDraftBadge: (input: unknown) => mockInsertDraftBadge(input),
  updateDraftBadge: (input: unknown) => mockUpdateDraftBadge(input),
  publishBadgeRow: (id: unknown, staffId: unknown) => mockPublishBadgeRow(id, staffId),
  unpublishBadgeRow: (id: unknown) => mockUnpublishBadgeRow(id),
  listAllBadges: () => mockListAllBadges(),
  listPublishedBadges: () => mockListPublishedBadges(),
  listUnlockedBadgeIdsForUser: (userId: unknown) => mockListUnlockedBadgeIdsForUser(userId),
  listUserBadgesForUser: (userId: unknown) => mockListUserBadgesForUser(userId),
  insertUserBadgeIfAbsent: (userId: unknown, badgeId: unknown) => mockInsertUserBadgeIfAbsent(userId, badgeId),
}));

const mockLessonsCompleted = vi.fn();
const mockStreakDays = vi.fn();
const mockQuizAccuracy = vi.fn();
vi.mock("./evaluators", () => ({
  BADGE_CRITERIA_EVALUATORS: {
    lessons_completed: (userId: unknown) => mockLessonsCompleted(userId),
    streak_days: (userId: unknown) => mockStreakDays(userId),
    quiz_accuracy_pct: (userId: unknown) => mockQuizAccuracy(userId),
  },
}));

const mockCreditVmoney = vi.fn();
vi.mock("@/server/economy/service", () => ({
  creditVmoney: (input: unknown) => mockCreditVmoney(input),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

const mockLogInternalError = vi.fn();
vi.mock("@/lib/http", () => ({
  logInternalError: (errorId: unknown, err: unknown) => mockLogInternalError(errorId, err),
}));

import {
  createBadgeDraft,
  evaluateBadgesForUser,
  getMyBadges,
  publishBadge,
  unpublishBadge,
  updateBadgeDraft,
} from "./service";

const ACTOR = { id: "staff_1" };
const USER = { id: "user_1" };
const META = { ip: "1.2.3.4", userAgent: "test-agent" };

function badgeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "badge_1",
    name: { en: "Pehla Kadam", hi: "x", hx: "x" },
    description: { en: "x", hi: "x", hx: "x" },
    category: "learning",
    criteria: { type: "lessons_completed", threshold: 5 },
    vmReward: 50,
    iconKey: null,
    status: "draft" as const,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("publishBadge", () => {
  it("blocks publish and names every missing field when a language is blank", async () => {
    mockGetBadgeById.mockResolvedValueOnce(
      badgeRow({ name: { en: "Pehla Kadam", hi: "", hx: "Pehla Kadam" } }),
    );

    await expect(publishBadge(ACTOR, "badge_1", META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: { missingFields: ["name.hi"] },
    });
    expect(mockPublishBadgeRow).not.toHaveBeenCalled();
  });

  it("publishes and logs when every field is filled", async () => {
    mockGetBadgeById.mockResolvedValueOnce(badgeRow());
    mockPublishBadgeRow.mockResolvedValueOnce(badgeRow({ status: "published" }));

    const result = await publishBadge(ACTOR, "badge_1", META);

    expect(result.status).toBe("published");
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "badge.published" }));
  });
});

describe("createBadgeDraft / updateBadgeDraft / unpublishBadge", () => {
  it("createBadgeDraft creates and logs", async () => {
    mockInsertDraftBadge.mockResolvedValueOnce(badgeRow());

    const created = await createBadgeDraft(ACTOR, badgeRow() as never, META);

    expect(created.id).toBe("badge_1");
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "badge.created" }));
  });

  it("updateBadgeDraft throws NOT_FOUND when the badge doesn't exist", async () => {
    mockUpdateDraftBadge.mockResolvedValueOnce(null);

    await expect(updateBadgeDraft(ACTOR, { ...badgeRow(), id: "missing" } as never, META)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("unpublishBadge throws CONFLICT when the badge isn't published", async () => {
    mockUnpublishBadgeRow.mockResolvedValueOnce(null);

    await expect(unpublishBadge(ACTOR, "badge_1", META)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("evaluateBadgesForUser", () => {
  it("awards a badge once progress clears the threshold, crediting VM and logging", async () => {
    mockListPublishedBadges.mockResolvedValueOnce([badgeRow()]);
    mockListUnlockedBadgeIdsForUser.mockResolvedValueOnce(new Set());
    mockLessonsCompleted.mockResolvedValueOnce(5);
    mockInsertUserBadgeIfAbsent.mockResolvedValueOnce({ id: "ub_1", userId: USER.id, badgeId: "badge_1" });
    mockCreditVmoney.mockResolvedValueOnce({ credited: true, amount: 50 });

    const unlocked = await evaluateBadgesForUser(USER, META);

    expect(unlocked).toHaveLength(1);
    expect(mockInsertUserBadgeIfAbsent).toHaveBeenCalledWith(USER.id, "badge_1");
    expect(mockCreditVmoney).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER.id, sourceType: "badge_unlock", sourceId: "badge_1", baseAmount: 50 }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "badge.unlocked" }));
  });

  it("never re-awards a badge the user already has, without even evaluating it", async () => {
    mockListPublishedBadges.mockResolvedValueOnce([badgeRow()]);
    mockListUnlockedBadgeIdsForUser.mockResolvedValueOnce(new Set(["badge_1"]));

    const unlocked = await evaluateBadgesForUser(USER, META);

    expect(unlocked).toHaveLength(0);
    expect(mockLessonsCompleted).not.toHaveBeenCalled();
    expect(mockInsertUserBadgeIfAbsent).not.toHaveBeenCalled();
  });

  it("running evaluation twice never re-awards or re-credits (idempotent)", async () => {
    mockListPublishedBadges.mockResolvedValue([badgeRow()]);
    mockLessonsCompleted.mockResolvedValue(5);

    // First run: genuinely unlocks.
    mockListUnlockedBadgeIdsForUser.mockResolvedValueOnce(new Set());
    mockInsertUserBadgeIfAbsent.mockResolvedValueOnce({ id: "ub_1" });
    mockCreditVmoney.mockResolvedValueOnce({ credited: true, amount: 50 });
    const first = await evaluateBadgesForUser(USER, META);
    expect(first).toHaveLength(1);

    // Second run: already unlocked, never re-evaluated.
    mockListUnlockedBadgeIdsForUser.mockResolvedValueOnce(new Set(["badge_1"]));
    const second = await evaluateBadgesForUser(USER, META);

    expect(second).toHaveLength(0);
    expect(mockInsertUserBadgeIfAbsent).toHaveBeenCalledTimes(1);
    expect(mockCreditVmoney).toHaveBeenCalledTimes(1);
  });

  it("does not award a badge whose progress hasn't reached the threshold yet", async () => {
    mockListPublishedBadges.mockResolvedValueOnce([badgeRow({ criteria: { type: "lessons_completed", threshold: 10 } })]);
    mockListUnlockedBadgeIdsForUser.mockResolvedValueOnce(new Set());
    mockLessonsCompleted.mockResolvedValueOnce(5);

    const unlocked = await evaluateBadgesForUser(USER, META);

    expect(unlocked).toHaveLength(0);
    expect(mockInsertUserBadgeIfAbsent).not.toHaveBeenCalled();
  });

  it("skips a badge that lost the award race (insertUserBadgeIfAbsent returns null) without crediting twice", async () => {
    mockListPublishedBadges.mockResolvedValueOnce([badgeRow()]);
    mockListUnlockedBadgeIdsForUser.mockResolvedValueOnce(new Set());
    mockLessonsCompleted.mockResolvedValueOnce(5);
    mockInsertUserBadgeIfAbsent.mockResolvedValueOnce(null);

    const unlocked = await evaluateBadgesForUser(USER, META);

    expect(unlocked).toHaveLength(0);
    expect(mockCreditVmoney).not.toHaveBeenCalled();
  });

  it("one badge's evaluation failure never stops the others from being checked", async () => {
    mockListPublishedBadges.mockResolvedValueOnce([
      badgeRow({ id: "badge_broken", criteria: { type: "lessons_completed", threshold: 1 } }),
      badgeRow({ id: "badge_ok", criteria: { type: "streak_days", threshold: 3 } }),
    ]);
    mockListUnlockedBadgeIdsForUser.mockResolvedValueOnce(new Set());
    mockLessonsCompleted.mockRejectedValueOnce(new Error("boom"));
    mockStreakDays.mockResolvedValueOnce(3);
    mockInsertUserBadgeIfAbsent.mockResolvedValueOnce({ id: "ub_ok" });
    mockCreditVmoney.mockResolvedValueOnce({ credited: true, amount: 50 });

    const unlocked = await evaluateBadgesForUser(USER, META);

    expect(unlocked).toHaveLength(1);
    expect(unlocked[0]!.id).toBe("badge_ok");
    expect(mockLogInternalError).toHaveBeenCalledWith("badges.evaluate_failed", expect.any(Error));
  });
});

describe("getMyBadges", () => {
  it("shows real progress for a locked badge, capped at the threshold", async () => {
    mockListPublishedBadges.mockResolvedValueOnce([badgeRow({ criteria: { type: "lessons_completed", threshold: 5 } })]);
    mockListUserBadgesForUser.mockResolvedValueOnce([]);
    mockLessonsCompleted.mockResolvedValueOnce(3);

    const result = await getMyBadges(USER.id);

    expect(result).toEqual([
      expect.objectContaining({ id: "badge_1", target: 5, progress: 3, unlocked: false, unlockedAt: null }),
    ]);
  });

  it("shows an unlocked badge at full progress with its unlock date, without re-evaluating", async () => {
    const unlockedAt = new Date("2026-04-17T00:00:00.000Z");
    mockListPublishedBadges.mockResolvedValueOnce([badgeRow({ criteria: { type: "lessons_completed", threshold: 5 } })]);
    mockListUserBadgesForUser.mockResolvedValueOnce([{ badgeId: "badge_1", createdAt: unlockedAt }]);

    const result = await getMyBadges(USER.id);

    expect(result).toEqual([
      expect.objectContaining({ progress: 5, unlocked: true, unlockedAt }),
    ]);
    expect(mockLessonsCompleted).not.toHaveBeenCalled();
  });
});
