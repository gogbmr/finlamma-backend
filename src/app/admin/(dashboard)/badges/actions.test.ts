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

const mockCreateBadgeDraft = vi.fn();
const mockUpdateBadgeDraft = vi.fn();
const mockPublishBadge = vi.fn();
const mockUnpublishBadge = vi.fn();
vi.mock("@/server/badges/service", () => ({
  createBadgeDraft: (actor: unknown, input: unknown, meta: unknown) => mockCreateBadgeDraft(actor, input, meta),
  updateBadgeDraft: (actor: unknown, input: unknown, meta: unknown) => mockUpdateBadgeDraft(actor, input, meta),
  publishBadge: (actor: unknown, id: unknown, meta: unknown) => mockPublishBadge(actor, id, meta),
  unpublishBadge: (actor: unknown, id: unknown, meta: unknown) => mockUnpublishBadge(actor, id, meta),
}));

import {
  createBadgeDraftAction,
  publishBadgeAction,
  unpublishBadgeAction,
  updateBadgeDraftAction,
} from "./actions";

const ACTOR = { id: "staff_1" };
const BADGE_ID = "b3b6c6f0-8f2a-4b8b-9f0a-2b8b8b8b8b8b";
const VALID_INPUT = {
  name: { en: "Pehla Kadam", hi: "x", hx: "x" },
  description: { en: "x", hi: "x", hx: "x" },
  category: "learning",
  criteria: { type: "lessons_completed", threshold: 1 },
  vmReward: 50,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("wrong role is rejected", () => {
  it("createBadgeDraftAction requires economy.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: economy.manage"));

    const result = await createBadgeDraftAction(VALID_INPUT);

    expect(result).toEqual({ ok: false, error: "Missing permission: economy.manage" });
    expect(mockCreateBadgeDraft).not.toHaveBeenCalled();
  });
});

describe("happy path", () => {
  beforeEach(() => {
    mockRequireStaff.mockResolvedValue(ACTOR);
  });

  it("createBadgeDraftAction creates and revalidates", async () => {
    mockCreateBadgeDraft.mockResolvedValueOnce({ id: "badge_1" });

    const result = await createBadgeDraftAction(VALID_INPUT);

    expect(result).toEqual({ ok: true });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/badges");
  });

  it("createBadgeDraftAction rejects a VM reward above the max without calling the service", async () => {
    const result = await createBadgeDraftAction({ ...VALID_INPUT, vmReward: 50_000 });

    expect(result.ok).toBe(false);
    expect(mockCreateBadgeDraft).not.toHaveBeenCalled();
  });

  it("createBadgeDraftAction rejects an unknown criteria type", async () => {
    const result = await createBadgeDraftAction({
      ...VALID_INPUT,
      criteria: { type: "not_a_real_type", threshold: 1 },
    });

    expect(result.ok).toBe(false);
    expect(mockCreateBadgeDraft).not.toHaveBeenCalled();
  });

  it("updateBadgeDraftAction updates and revalidates", async () => {
    mockUpdateBadgeDraft.mockResolvedValueOnce({ id: BADGE_ID });

    const result = await updateBadgeDraftAction({ id: BADGE_ID, ...VALID_INPUT });

    expect(result).toEqual({ ok: true });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/badges");
  });

  it("publishBadgeAction publishes and revalidates", async () => {
    mockPublishBadge.mockResolvedValueOnce({ id: BADGE_ID, status: "published" });

    const result = await publishBadgeAction({ id: BADGE_ID });

    expect(result).toEqual({ ok: true });
  });

  it("publishBadgeAction surfaces a validation error from the service", async () => {
    mockPublishBadge.mockRejectedValueOnce(
      new AppError("VALIDATION_FAILED", "Cannot publish: missing name.hi", { missingFields: ["name.hi"] }),
    );

    const result = await publishBadgeAction({ id: BADGE_ID });

    expect(result).toEqual({ ok: false, error: "Cannot publish: missing name.hi" });
  });

  it("unpublishBadgeAction unpublishes and revalidates", async () => {
    mockUnpublishBadge.mockResolvedValueOnce({ id: BADGE_ID, status: "draft" });

    const result = await unpublishBadgeAction({ id: BADGE_ID });

    expect(result).toEqual({ ok: true });
  });
});
