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
const mockAwardBadgeAndCreditVmoney = vi.fn();
const mockSetBadgeIconImageKey = vi.fn();
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
  awardBadgeAndCreditVmoney: (userId: unknown, badgeId: unknown, vmoney: unknown) =>
    mockAwardBadgeAndCreditVmoney(userId, badgeId, vmoney),
  setBadgeIconImageKey: (id: unknown, key: unknown) => mockSetBadgeIconImageKey(id, key),
}));

const mockGetSignedDownloadUrl = vi.fn();
const mockUploadObject = vi.fn();
vi.mock("@/lib/s3", () => ({
  getSignedDownloadUrl: (key: unknown) => mockGetSignedDownloadUrl(key),
  uploadObject: (key: unknown, body: unknown, contentType: unknown) =>
    mockUploadObject(key, body, contentType),
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

const mockGetVmIssuanceMultiplier = vi.fn();
vi.mock("@/server/economy/service", () => ({
  getVmIssuanceMultiplier: () => mockGetVmIssuanceMultiplier(),
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
  getBadgeEditorData,
  getMyBadges,
  publishBadge,
  unpublishBadge,
  updateBadgeDraft,
  uploadBadgeIcon,
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
  mockGetVmIssuanceMultiplier.mockResolvedValue(1);
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
  it("awards a badge once progress clears the threshold, crediting VM (in one transaction) and logging", async () => {
    mockListPublishedBadges.mockResolvedValueOnce([badgeRow()]);
    mockListUnlockedBadgeIdsForUser.mockResolvedValueOnce(new Set());
    mockLessonsCompleted.mockResolvedValueOnce(5);
    mockAwardBadgeAndCreditVmoney.mockResolvedValueOnce({
      userBadge: { id: "ub_1", userId: USER.id, badgeId: "badge_1" },
      vmRow: { id: "ledger_1" },
    });

    const unlocked = await evaluateBadgesForUser(USER, META);

    expect(unlocked).toHaveLength(1);
    expect(mockAwardBadgeAndCreditVmoney).toHaveBeenCalledWith(
      USER.id,
      "badge_1",
      expect.objectContaining({ sourceType: "badge_unlock", sourceId: "badge_1", amountPaise: 5000, multiplierApplied: 1 }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "badge.unlocked" }));
  });

  it("applies the current VM issuance multiplier to the badge's base VM reward", async () => {
    mockListPublishedBadges.mockResolvedValueOnce([badgeRow({ vmReward: 50 })]);
    mockListUnlockedBadgeIdsForUser.mockResolvedValueOnce(new Set());
    mockLessonsCompleted.mockResolvedValueOnce(5);
    mockGetVmIssuanceMultiplier.mockResolvedValueOnce(2);
    mockAwardBadgeAndCreditVmoney.mockResolvedValueOnce({ userBadge: { id: "ub_1" }, vmRow: { id: "ledger_1" } });

    await evaluateBadgesForUser(USER, META);

    expect(mockAwardBadgeAndCreditVmoney).toHaveBeenCalledWith(
      USER.id,
      "badge_1",
      expect.objectContaining({ amountPaise: 10000, multiplierApplied: 2 }),
    );
  });

  it("never re-awards a badge the user already has, without even evaluating it", async () => {
    mockListPublishedBadges.mockResolvedValueOnce([badgeRow()]);
    mockListUnlockedBadgeIdsForUser.mockResolvedValueOnce(new Set(["badge_1"]));

    const unlocked = await evaluateBadgesForUser(USER, META);

    expect(unlocked).toHaveLength(0);
    expect(mockLessonsCompleted).not.toHaveBeenCalled();
    expect(mockAwardBadgeAndCreditVmoney).not.toHaveBeenCalled();
  });

  it("running evaluation twice never re-awards or re-credits (idempotent)", async () => {
    mockListPublishedBadges.mockResolvedValue([badgeRow()]);
    mockLessonsCompleted.mockResolvedValue(5);

    // First run: genuinely unlocks.
    mockListUnlockedBadgeIdsForUser.mockResolvedValueOnce(new Set());
    mockAwardBadgeAndCreditVmoney.mockResolvedValueOnce({ userBadge: { id: "ub_1" }, vmRow: { id: "ledger_1" } });
    const first = await evaluateBadgesForUser(USER, META);
    expect(first).toHaveLength(1);

    // Second run: already unlocked, never re-evaluated.
    mockListUnlockedBadgeIdsForUser.mockResolvedValueOnce(new Set(["badge_1"]));
    const second = await evaluateBadgesForUser(USER, META);

    expect(second).toHaveLength(0);
    expect(mockAwardBadgeAndCreditVmoney).toHaveBeenCalledTimes(1);
  });

  it("does not award a badge whose progress hasn't reached the threshold yet", async () => {
    mockListPublishedBadges.mockResolvedValueOnce([badgeRow({ criteria: { type: "lessons_completed", threshold: 10 } })]);
    mockListUnlockedBadgeIdsForUser.mockResolvedValueOnce(new Set());
    mockLessonsCompleted.mockResolvedValueOnce(5);

    const unlocked = await evaluateBadgesForUser(USER, META);

    expect(unlocked).toHaveLength(0);
    expect(mockAwardBadgeAndCreditVmoney).not.toHaveBeenCalled();
  });

  it("skips a badge that lost the award race (awardBadgeAndCreditVmoney returns null) without logging a fake unlock", async () => {
    mockListPublishedBadges.mockResolvedValueOnce([badgeRow()]);
    mockListUnlockedBadgeIdsForUser.mockResolvedValueOnce(new Set());
    mockLessonsCompleted.mockResolvedValueOnce(5);
    mockAwardBadgeAndCreditVmoney.mockResolvedValueOnce(null);

    const unlocked = await evaluateBadgesForUser(USER, META);

    expect(unlocked).toHaveLength(0);
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("one badge's evaluation failure never stops the others from being checked", async () => {
    mockListPublishedBadges.mockResolvedValueOnce([
      badgeRow({ id: "badge_broken", criteria: { type: "lessons_completed", threshold: 1 } }),
      badgeRow({ id: "badge_ok", criteria: { type: "streak_days", threshold: 3 } }),
    ]);
    mockListUnlockedBadgeIdsForUser.mockResolvedValueOnce(new Set());
    mockLessonsCompleted.mockRejectedValueOnce(new Error("boom"));
    mockStreakDays.mockResolvedValueOnce(3);
    mockAwardBadgeAndCreditVmoney.mockResolvedValueOnce({ userBadge: { id: "ub_ok" }, vmRow: { id: "ledger_1" } });

    const unlocked = await evaluateBadgesForUser(USER, META);

    expect(unlocked).toHaveLength(1);
    expect(unlocked[0]!.id).toBe("badge_ok");
    expect(mockLogInternalError).toHaveBeenCalledWith("badges.evaluate_failed", expect.any(Error));
  });

  it("a credit failure inside the transaction never logs a fake unlock - the caller's try/catch still isolates this badge from the others", async () => {
    mockListPublishedBadges.mockResolvedValueOnce([
      badgeRow({ id: "badge_broken", criteria: { type: "lessons_completed", threshold: 1 } }),
      badgeRow({ id: "badge_ok", criteria: { type: "streak_days", threshold: 3 } }),
    ]);
    mockListUnlockedBadgeIdsForUser.mockResolvedValueOnce(new Set());
    mockLessonsCompleted.mockResolvedValueOnce(1);
    mockStreakDays.mockResolvedValueOnce(3);
    // Simulates the whole transaction (award + credit) failing/rolling back -
    // the real repo function throws in that case (a rejected transaction
    // promise), never returns a half-done result.
    mockAwardBadgeAndCreditVmoney.mockRejectedValueOnce(new Error("db down"));
    mockAwardBadgeAndCreditVmoney.mockResolvedValueOnce({ userBadge: { id: "ub_ok" }, vmRow: { id: "ledger_1" } });

    const unlocked = await evaluateBadgesForUser(USER, META);

    expect(unlocked).toHaveLength(1);
    expect(unlocked[0]!.id).toBe("badge_ok");
    expect(mockLogActivity).not.toHaveBeenCalledWith(
      expect.objectContaining({ targetId: "badge_broken" }),
    );
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

  // App asks batch, item A10.
  it("reports iconUrl: null when no icon has been uploaded, never calling getSignedDownloadUrl", async () => {
    mockListPublishedBadges.mockResolvedValueOnce([badgeRow()]);
    mockListUserBadgesForUser.mockResolvedValueOnce([]);
    mockLessonsCompleted.mockResolvedValueOnce(0);

    const result = await getMyBadges(USER.id);

    expect(result[0]!.iconUrl).toBeNull();
    expect(mockGetSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("resolves iconUrl via a signed URL once an icon has been uploaded", async () => {
    mockListPublishedBadges.mockResolvedValueOnce([badgeRow({ iconImageKey: "badges/badge_1/x.png" })]);
    mockListUserBadgesForUser.mockResolvedValueOnce([]);
    mockLessonsCompleted.mockResolvedValueOnce(0);
    mockGetSignedDownloadUrl.mockResolvedValueOnce("https://signed.example/icon.png");

    const result = await getMyBadges(USER.id);

    expect(result[0]!.iconUrl).toBe("https://signed.example/icon.png");
    expect(mockGetSignedDownloadUrl).toHaveBeenCalledWith("badges/badge_1/x.png");
  });
});

describe("getBadgeEditorData", () => {
  it("merges iconUrl into every badge for the admin preview", async () => {
    mockListAllBadges.mockResolvedValueOnce([
      badgeRow({ id: "badge_1", iconImageKey: null }),
      badgeRow({ id: "badge_2", iconImageKey: "badges/badge_2/x.png" }),
    ]);
    mockGetSignedDownloadUrl.mockResolvedValueOnce("https://signed.example/icon2.png");

    const result = await getBadgeEditorData();

    expect(result[0]).toMatchObject({ id: "badge_1", iconUrl: null });
    expect(result[1]).toMatchObject({ id: "badge_2", iconUrl: "https://signed.example/icon2.png" });
  });
});

// App asks batch, item A10 - mirrors mentors/service.test.ts's
// uploadMentorArt tests.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("uploadBadgeIcon", () => {
  it("uploads to storage under a server-generated, unique key, records old+new keys, and logs it", async () => {
    mockGetBadgeById.mockResolvedValueOnce(badgeRow({ iconImageKey: "badges/badge_1/old-key.png" }));
    mockSetBadgeIconImageKey.mockResolvedValueOnce(badgeRow({ iconImageKey: "badges/badge_1/new-key.png" }));
    mockGetSignedDownloadUrl.mockResolvedValueOnce("https://signed.example/new-key.png");

    const result = await uploadBadgeIcon(ACTOR, "badge_1", { body: PNG_BYTES }, META);

    expect(mockUploadObject).toHaveBeenCalledWith(
      expect.stringMatching(/^badges\/badge_1\/[0-9a-f-]+\.png$/),
      PNG_BYTES,
      "image/png",
    );
    expect(result.iconUrl).toBe("https://signed.example/new-key.png");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "badge.icon_uploaded",
        metadata: expect.objectContaining({
          previousIconImageKey: "badges/badge_1/old-key.png",
          newIconImageKey: expect.stringMatching(/^badges\/badge_1\/[0-9a-f-]+\.png$/),
        }),
      }),
    );
  });

  it("rejects a file whose bytes aren't a real PNG/JPEG/WebP", async () => {
    mockGetBadgeById.mockResolvedValueOnce(badgeRow());
    const svgDisguisedAsImage = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      "utf8",
    );

    await expect(
      uploadBadgeIcon(ACTOR, "badge_1", { body: svgDisguisedAsImage }, META),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(mockUploadObject).not.toHaveBeenCalled();
    expect(mockSetBadgeIconImageKey).not.toHaveBeenCalled();
  });

  it("rejects a file over the 2MB cap even if the bytes are a real PNG", async () => {
    mockGetBadgeById.mockResolvedValueOnce(badgeRow());
    const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(2 * 1024 * 1024)]);

    await expect(
      uploadBadgeIcon(ACTOR, "badge_1", { body: oversized }, META),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for an unknown badge", async () => {
    mockGetBadgeById.mockResolvedValueOnce(null);

    await expect(
      uploadBadgeIcon(ACTOR, "nope", { body: PNG_BYTES }, META),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockUploadObject).not.toHaveBeenCalled();
  });
});
