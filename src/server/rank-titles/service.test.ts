import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

const mockDeleteRankTitleRow = vi.fn();
const mockGetRankTitleById = vi.fn();
const mockGetRankTitleForLevel = vi.fn();
const mockInsertRankTitle = vi.fn();
const mockListRankTitles = vi.fn();
const mockUpdateRankTitleRow = vi.fn();
vi.mock("./repo", () => ({
  deleteRankTitleRow: (id: unknown) => mockDeleteRankTitleRow(id),
  getRankTitleById: (id: unknown) => mockGetRankTitleById(id),
  getRankTitleForLevel: (level: unknown) => mockGetRankTitleForLevel(level),
  insertRankTitle: (input: unknown) => mockInsertRankTitle(input),
  listRankTitles: () => mockListRankTitles(),
  updateRankTitleRow: (id: unknown, input: unknown) => mockUpdateRankTitleRow(id, input),
}));

import {
  createRankTitleForAdmin,
  deleteRankTitleForAdmin,
  getRankTitleForLevel,
  listRankTitlesForAdmin,
  updateRankTitleForAdmin,
} from "./service";

const ACTOR = { id: "staff_1" };
const META = { ip: "1.2.3.4", userAgent: "test-agent" };
const TITLE = { en: "Sprout", hi: "x", hx: "x" };
const INPUT = { minLevel: 5, title: TITLE };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRankTitleForLevel", () => {
  it("passes through to the repo - no auth check, this is a public read", async () => {
    mockGetRankTitleForLevel.mockResolvedValueOnce({ id: "rt_1", minLevel: 5, title: TITLE });

    const result = await getRankTitleForLevel(7);

    expect(result?.id).toBe("rt_1");
    expect(mockGetRankTitleForLevel).toHaveBeenCalledWith(7);
  });
});

describe("listRankTitlesForAdmin", () => {
  it("passes through to the repo", async () => {
    mockListRankTitles.mockResolvedValueOnce([{ id: "rt_1", minLevel: 5, title: TITLE }]);

    expect(await listRankTitlesForAdmin()).toHaveLength(1);
  });
});

describe("createRankTitleForAdmin", () => {
  it("creates and logs the new row", async () => {
    mockInsertRankTitle.mockResolvedValueOnce({ id: "rt_1", ...INPUT });

    const result = await createRankTitleForAdmin(ACTOR, INPUT, META);

    expect(result.id).toBe("rt_1");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: "staff", actorId: "staff_1", action: "rank_titles.created" }),
    );
  });

  it("turns a unique-constraint violation on minLevel into a clear CONFLICT", async () => {
    mockInsertRankTitle.mockRejectedValueOnce({ code: "23505" });

    await expect(createRankTitleForAdmin(ACTOR, INPUT, META)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});

describe("updateRankTitleForAdmin", () => {
  it("updates and logs previous/next", async () => {
    mockGetRankTitleById.mockResolvedValueOnce({ id: "rt_1", minLevel: 5, title: TITLE });
    mockUpdateRankTitleRow.mockResolvedValueOnce({ id: "rt_1", minLevel: 6, title: TITLE });

    const result = await updateRankTitleForAdmin(ACTOR, "rt_1", { minLevel: 6, title: TITLE }, META);

    expect(result.minLevel).toBe(6);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rank_titles.updated",
        metadata: { previous: { minLevel: 5, title: TITLE }, next: { minLevel: 6, title: TITLE } },
      }),
    );
  });

  it("throws NOT_FOUND when the row doesn't exist", async () => {
    mockGetRankTitleById.mockResolvedValueOnce(null);

    await expect(updateRankTitleForAdmin(ACTOR, "nope", INPUT, META)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockUpdateRankTitleRow).not.toHaveBeenCalled();
  });

  it("turns a unique-constraint violation on minLevel into a clear CONFLICT", async () => {
    mockGetRankTitleById.mockResolvedValueOnce({ id: "rt_1", minLevel: 5, title: TITLE });
    mockUpdateRankTitleRow.mockRejectedValueOnce({ code: "23505" });

    await expect(updateRankTitleForAdmin(ACTOR, "rt_1", INPUT, META)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("deleteRankTitleForAdmin", () => {
  it("deletes and logs the removed row", async () => {
    mockDeleteRankTitleRow.mockResolvedValueOnce({ id: "rt_1", minLevel: 5, title: TITLE });

    const result = await deleteRankTitleForAdmin(ACTOR, "rt_1", META);

    expect(result.id).toBe("rt_1");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "rank_titles.deleted" }),
    );
  });

  it("throws NOT_FOUND when the row doesn't exist", async () => {
    mockDeleteRankTitleRow.mockResolvedValueOnce(null);

    await expect(deleteRankTitleForAdmin(ACTOR, "nope", META)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
