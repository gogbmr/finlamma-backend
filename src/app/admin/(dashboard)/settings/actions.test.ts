import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { DEFAULT_LESSON_FLOW_SCORING } from "@/server/settings/schemas";

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

const mockUpdateLessonFlowScoringSettings = vi.fn();
vi.mock("@/server/settings/service", () => ({
  updateLessonFlowScoringSettings: (actor: unknown, input: unknown, meta: unknown) =>
    mockUpdateLessonFlowScoringSettings(actor, input, meta),
}));

const mockUpdateVmIssuanceMultiplier = vi.fn();
const mockUpdateRewardRuleForAdmin = vi.fn();
vi.mock("@/server/economy/service", () => ({
  updateVmIssuanceMultiplier: (actor: unknown, value: unknown, meta: unknown) =>
    mockUpdateVmIssuanceMultiplier(actor, value, meta),
  updateRewardRuleForAdmin: (actor: unknown, kind: unknown, input: unknown, meta: unknown) =>
    mockUpdateRewardRuleForAdmin(actor, kind, input, meta),
}));

const mockUpdateStreaksSettings = vi.fn();
vi.mock("@/server/streaks/service", () => ({
  updateStreaksSettings: (actor: unknown, input: unknown, meta: unknown) =>
    mockUpdateStreaksSettings(actor, input, meta),
}));

const mockUpdateLevelCurveSettings = vi.fn();
vi.mock("@/server/leveling/service", () => ({
  updateLevelCurveSettings: (actor: unknown, input: unknown, meta: unknown) =>
    mockUpdateLevelCurveSettings(actor, input, meta),
}));

const mockCreateRankTitleForAdmin = vi.fn();
const mockUpdateRankTitleForAdmin = vi.fn();
const mockDeleteRankTitleForAdmin = vi.fn();
vi.mock("@/server/rank-titles/service", () => ({
  createRankTitleForAdmin: (actor: unknown, input: unknown, meta: unknown) =>
    mockCreateRankTitleForAdmin(actor, input, meta),
  updateRankTitleForAdmin: (actor: unknown, id: unknown, input: unknown, meta: unknown) =>
    mockUpdateRankTitleForAdmin(actor, id, input, meta),
  deleteRankTitleForAdmin: (actor: unknown, id: unknown, meta: unknown) =>
    mockDeleteRankTitleForAdmin(actor, id, meta),
}));

import {
  createRankTitleAction,
  deleteRankTitleAction,
  updateLessonFlowScoringAction,
  updateLevelCurveSettingsAction,
  updateRankTitleAction,
  updateRewardRuleAction,
  updateStreaksSettingsAction,
  updateVmIssuanceMultiplierAction,
} from "./actions";

const ACTOR = { id: "staff_1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("wrong role is rejected", () => {
  it("updateLessonFlowScoringAction: requires settings.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "Missing permission: settings.manage"),
    );

    const result = await updateLessonFlowScoringAction(DEFAULT_LESSON_FLOW_SCORING);

    expect(result).toEqual({ ok: false, error: "Missing permission: settings.manage" });
    expect(mockRequireStaff).toHaveBeenCalledWith("settings.manage");
    expect(mockUpdateLessonFlowScoringSettings).not.toHaveBeenCalled();
  });

  it("updateVmIssuanceMultiplierAction: requires economy.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "Missing permission: economy.manage"),
    );

    const result = await updateVmIssuanceMultiplierAction(1.5);

    expect(result).toEqual({ ok: false, error: "Missing permission: economy.manage" });
    expect(mockRequireStaff).toHaveBeenCalledWith("economy.manage");
    expect(mockUpdateVmIssuanceMultiplier).not.toHaveBeenCalled();
  });

  it("updateRewardRuleAction: requires economy.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "Missing permission: economy.manage"),
    );

    const result = await updateRewardRuleAction("video", {
      defaultXp: 20,
      defaultVm: 30,
      active: true,
    });

    expect(result).toEqual({ ok: false, error: "Missing permission: economy.manage" });
    expect(mockRequireStaff).toHaveBeenCalledWith("economy.manage");
    expect(mockUpdateRewardRuleForAdmin).not.toHaveBeenCalled();
  });

  it("updateStreaksSettingsAction: requires settings.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "Missing permission: settings.manage"),
    );

    const result = await updateStreaksSettingsAction({ streakFreezesPerMonth: 2 });

    expect(result).toEqual({ ok: false, error: "Missing permission: settings.manage" });
    expect(mockRequireStaff).toHaveBeenCalledWith("settings.manage");
    expect(mockUpdateStreaksSettings).not.toHaveBeenCalled();
  });

  it("updateLevelCurveSettingsAction: requires settings.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "Missing permission: settings.manage"),
    );

    const result = await updateLevelCurveSettingsAction({ baseXp: 300, stepXp: 100 });

    expect(result).toEqual({ ok: false, error: "Missing permission: settings.manage" });
    expect(mockRequireStaff).toHaveBeenCalledWith("settings.manage");
    expect(mockUpdateLevelCurveSettings).not.toHaveBeenCalled();
  });

  it("createRankTitleAction: requires settings.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "Missing permission: settings.manage"),
    );

    const result = await createRankTitleAction({ minLevel: 5, title: { en: "x", hi: "x", hx: "x" } });

    expect(result).toEqual({ ok: false, error: "Missing permission: settings.manage" });
    expect(mockCreateRankTitleForAdmin).not.toHaveBeenCalled();
  });

  it("updateRankTitleAction: requires settings.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "Missing permission: settings.manage"),
    );

    const result = await updateRankTitleAction("rt_1", { minLevel: 5, title: { en: "x", hi: "x", hx: "x" } });

    expect(result).toEqual({ ok: false, error: "Missing permission: settings.manage" });
    expect(mockUpdateRankTitleForAdmin).not.toHaveBeenCalled();
  });

  it("deleteRankTitleAction: requires settings.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "Missing permission: settings.manage"),
    );

    const result = await deleteRankTitleAction("rt_1");

    expect(result).toEqual({ ok: false, error: "Missing permission: settings.manage" });
    expect(mockDeleteRankTitleForAdmin).not.toHaveBeenCalled();
  });
});

describe("happy path", () => {
  beforeEach(() => {
    mockRequireStaff.mockResolvedValue(ACTOR);
  });

  it("updates and revalidates", async () => {
    mockUpdateLessonFlowScoringSettings.mockResolvedValueOnce(DEFAULT_LESSON_FLOW_SCORING);

    const result = await updateLessonFlowScoringAction(DEFAULT_LESSON_FLOW_SCORING);

    expect(result).toEqual({ ok: true });
    expect(mockUpdateLessonFlowScoringSettings).toHaveBeenCalledWith(
      ACTOR,
      DEFAULT_LESSON_FLOW_SCORING,
      expect.any(Object),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/settings");
  });

  it("rejects an invalid shape without calling the service", async () => {
    const result = await updateLessonFlowScoringAction({ ...DEFAULT_LESSON_FLOW_SCORING, speedBonusXp: "not a number" });

    expect(result.ok).toBe(false);
    expect(mockUpdateLessonFlowScoringSettings).not.toHaveBeenCalled();
  });

  it("updateVmIssuanceMultiplierAction updates and revalidates", async () => {
    mockUpdateVmIssuanceMultiplier.mockResolvedValueOnce(1.5);

    const result = await updateVmIssuanceMultiplierAction(1.5);

    expect(result).toEqual({ ok: true });
    expect(mockUpdateVmIssuanceMultiplier).toHaveBeenCalledWith(ACTOR, 1.5, expect.any(Object));
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/settings");
  });

  it("updateVmIssuanceMultiplierAction rejects a non-positive value without calling the service", async () => {
    const result = await updateVmIssuanceMultiplierAction(0);

    expect(result.ok).toBe(false);
    expect(mockUpdateVmIssuanceMultiplier).not.toHaveBeenCalled();
  });

  it("updateVmIssuanceMultiplierAction rejects a value above the max without calling the service", async () => {
    const result = await updateVmIssuanceMultiplierAction(3.01);

    expect(result.ok).toBe(false);
    expect(mockUpdateVmIssuanceMultiplier).not.toHaveBeenCalled();
  });

  it("updateRewardRuleAction updates and revalidates", async () => {
    mockUpdateRewardRuleForAdmin.mockResolvedValueOnce({
      activityKind: "video",
      defaultXp: 25,
      defaultVm: 35,
      active: true,
    });

    const result = await updateRewardRuleAction("video", {
      defaultXp: 25,
      defaultVm: 35,
      active: true,
    });

    expect(result).toEqual({ ok: true });
    expect(mockUpdateRewardRuleForAdmin).toHaveBeenCalledWith(
      ACTOR,
      "video",
      { defaultXp: 25, defaultVm: 35, active: true },
      expect.any(Object),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/settings");
  });

  it("updateRewardRuleAction rejects a negative XP/VM value without calling the service", async () => {
    const result = await updateRewardRuleAction("video", {
      defaultXp: -1,
      defaultVm: 30,
      active: true,
    });

    expect(result.ok).toBe(false);
    expect(mockUpdateRewardRuleForAdmin).not.toHaveBeenCalled();
  });

  it("updateRewardRuleAction rejects an amount above the max without calling the service", async () => {
    const result = await updateRewardRuleAction("video", {
      defaultXp: 50_000,
      defaultVm: 30,
      active: true,
    });

    expect(result.ok).toBe(false);
    expect(mockUpdateRewardRuleForAdmin).not.toHaveBeenCalled();
  });

  it("updateStreaksSettingsAction updates and revalidates", async () => {
    mockUpdateStreaksSettings.mockResolvedValueOnce({ streakFreezesPerMonth: 3 });

    const result = await updateStreaksSettingsAction({ streakFreezesPerMonth: 3 });

    expect(result).toEqual({ ok: true });
    expect(mockUpdateStreaksSettings).toHaveBeenCalledWith(
      ACTOR,
      { streakFreezesPerMonth: 3 },
      expect.any(Object),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/settings");
  });

  it("updateStreaksSettingsAction rejects a negative freeze count without calling the service", async () => {
    const result = await updateStreaksSettingsAction({ streakFreezesPerMonth: -1 });

    expect(result.ok).toBe(false);
    expect(mockUpdateStreaksSettings).not.toHaveBeenCalled();
  });

  it("updateLevelCurveSettingsAction updates and revalidates", async () => {
    mockUpdateLevelCurveSettings.mockResolvedValueOnce({ baseXp: 500, stepXp: 50 });

    const result = await updateLevelCurveSettingsAction({ baseXp: 500, stepXp: 50 });

    expect(result).toEqual({ ok: true });
    expect(mockUpdateLevelCurveSettings).toHaveBeenCalledWith(
      ACTOR,
      { baseXp: 500, stepXp: 50 },
      expect.any(Object),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/settings");
  });

  it("updateLevelCurveSettingsAction rejects a non-positive baseXp without calling the service", async () => {
    const result = await updateLevelCurveSettingsAction({ baseXp: 0, stepXp: 50 });

    expect(result.ok).toBe(false);
    expect(mockUpdateLevelCurveSettings).not.toHaveBeenCalled();
  });

  it("createRankTitleAction creates and revalidates", async () => {
    const input = { minLevel: 5, title: { en: "Sprout", hi: "x", hx: "x" } };
    mockCreateRankTitleForAdmin.mockResolvedValueOnce({ id: "rt_1", ...input });

    const result = await createRankTitleAction(input);

    expect(result).toEqual({ ok: true });
    expect(mockCreateRankTitleForAdmin).toHaveBeenCalledWith(ACTOR, input, expect.any(Object));
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/settings");
  });

  it("createRankTitleAction rejects a blank language without calling the service", async () => {
    const result = await createRankTitleAction({ minLevel: 5, title: { en: "", hi: "x", hx: "x" } });

    expect(result.ok).toBe(false);
    expect(mockCreateRankTitleForAdmin).not.toHaveBeenCalled();
  });

  it("createRankTitleAction surfaces a CONFLICT from a duplicate min level", async () => {
    mockCreateRankTitleForAdmin.mockRejectedValueOnce(new AppError("CONFLICT", "Min level 5 is already in use"));

    const result = await createRankTitleAction({ minLevel: 5, title: { en: "x", hi: "x", hx: "x" } });

    expect(result).toEqual({ ok: false, error: "Min level 5 is already in use" });
  });

  it("updateRankTitleAction updates and revalidates", async () => {
    const input = { minLevel: 6, title: { en: "Bloom", hi: "x", hx: "x" } };
    mockUpdateRankTitleForAdmin.mockResolvedValueOnce({ id: "rt_1", ...input });

    const result = await updateRankTitleAction("rt_1", input);

    expect(result).toEqual({ ok: true });
    expect(mockUpdateRankTitleForAdmin).toHaveBeenCalledWith(ACTOR, "rt_1", input, expect.any(Object));
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/settings");
  });

  it("updateRankTitleAction surfaces NOT_FOUND for an unknown id", async () => {
    mockUpdateRankTitleForAdmin.mockRejectedValueOnce(new AppError("NOT_FOUND", "Rank title not found"));

    const result = await updateRankTitleAction("nope", { minLevel: 5, title: { en: "x", hi: "x", hx: "x" } });

    expect(result).toEqual({ ok: false, error: "Rank title not found" });
  });

  it("deleteRankTitleAction deletes and revalidates", async () => {
    mockDeleteRankTitleForAdmin.mockResolvedValueOnce({ id: "rt_1" });

    const result = await deleteRankTitleAction("rt_1");

    expect(result).toEqual({ ok: true });
    expect(mockDeleteRankTitleForAdmin).toHaveBeenCalledWith(ACTOR, "rt_1", expect.any(Object));
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/settings");
  });
});
