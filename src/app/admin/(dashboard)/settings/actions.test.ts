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

import {
  updateLessonFlowScoringAction,
  updateRewardRuleAction,
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
});
