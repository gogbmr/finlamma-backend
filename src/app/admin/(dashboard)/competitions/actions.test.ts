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

const mockCreateCompetitionDraft = vi.fn();
const mockUpdateCompetitionDraft = vi.fn();
const mockPublishCompetition = vi.fn();
const mockUpdateCompetitionSettingsForAdmin = vi.fn();
vi.mock("@/server/competitions/service", () => ({
  createCompetitionDraft: (actor: unknown, input: unknown, meta: unknown) =>
    mockCreateCompetitionDraft(actor, input, meta),
  updateCompetitionDraft: (actor: unknown, id: unknown, input: unknown, meta: unknown) =>
    mockUpdateCompetitionDraft(actor, id, input, meta),
  publishCompetition: (actor: unknown, id: unknown, meta: unknown) => mockPublishCompetition(actor, id, meta),
  updateCompetitionSettingsForAdmin: (actor: unknown, input: unknown, meta: unknown) =>
    mockUpdateCompetitionSettingsForAdmin(actor, input, meta),
}));

import {
  createCompetitionDraftAction,
  publishCompetitionAction,
  updateCompetitionDraftAction,
  updateCompetitionSettingsAction,
} from "./actions";

const ACTOR = { id: "staff_1" };
const COMPETITION_ID = "b3b6c6f0-8f2a-4b8b-9f0a-2b8b8b8b8b8b";
const INSTRUMENT_ID = "c4c7d7f1-9f3b-4c9c-8f1b-3c9c9c9c9c9c";

const VALID_DRAFT_INPUT = {
  name: { en: "October Cup", hi: "x", hx: "x" },
  instrumentId: INSTRUMENT_ID,
  virtualCapitalPaise: 10_000_000,
  windowStart: "2026-10-01T00:00:00.000Z",
  windowEnd: "2026-10-31T00:00:00.000Z",
  prizes: [
    { rankFrom: 1, rankTo: 1, vmAmount: 5000, badgeId: null },
    { rankFrom: 2, rankTo: 3, vmAmount: 2000, badgeId: null },
    { rankFrom: 4, rankTo: 10, vmAmount: 500, badgeId: null },
  ],
  rules: { en: "r", hi: "r", hx: "r" },
};

const VALID_SETTINGS_INPUT = { minQualifyingTrades: 5, maxTrades: 10, entryWindowPct: 50 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("wrong role is rejected", () => {
  it("createCompetitionDraftAction requires economy.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: economy.manage"));

    const result = await createCompetitionDraftAction(VALID_DRAFT_INPUT);

    expect(result).toEqual({ ok: false, error: "Missing permission: economy.manage" });
    expect(mockCreateCompetitionDraft).not.toHaveBeenCalled();
  });

  it("updateCompetitionSettingsAction requires economy.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: economy.manage"));

    const result = await updateCompetitionSettingsAction(VALID_SETTINGS_INPUT);

    expect(result.ok).toBe(false);
    expect(mockUpdateCompetitionSettingsForAdmin).not.toHaveBeenCalled();
  });
});

describe("happy path", () => {
  beforeEach(() => {
    mockRequireStaff.mockResolvedValue(ACTOR);
  });

  it("createCompetitionDraftAction creates and revalidates", async () => {
    mockCreateCompetitionDraft.mockResolvedValueOnce({ id: "comp_1" });

    const result = await createCompetitionDraftAction(VALID_DRAFT_INPUT);

    expect(result).toEqual({ ok: true });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/competitions");
  });

  it("createCompetitionDraftAction rejects windowEnd before windowStart without calling the service", async () => {
    const result = await createCompetitionDraftAction({
      ...VALID_DRAFT_INPUT,
      windowStart: "2026-10-31T00:00:00.000Z",
      windowEnd: "2026-10-01T00:00:00.000Z",
    });

    expect(result.ok).toBe(false);
    expect(mockCreateCompetitionDraft).not.toHaveBeenCalled();
  });

  it("updateCompetitionDraftAction updates and revalidates", async () => {
    mockUpdateCompetitionDraft.mockResolvedValueOnce({ id: COMPETITION_ID });

    const result = await updateCompetitionDraftAction(COMPETITION_ID, VALID_DRAFT_INPUT);

    expect(result).toEqual({ ok: true });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/competitions");
  });

  it("updateCompetitionDraftAction surfaces a not-found error from the service", async () => {
    mockUpdateCompetitionDraft.mockRejectedValueOnce(
      new AppError("NOT_FOUND", "Draft competition not found (or already published)"),
    );

    const result = await updateCompetitionDraftAction(COMPETITION_ID, VALID_DRAFT_INPUT);

    expect(result).toEqual({ ok: false, error: "Draft competition not found (or already published)" });
  });

  it("publishCompetitionAction publishes and revalidates", async () => {
    mockPublishCompetition.mockResolvedValueOnce({ id: COMPETITION_ID, status: "published" });

    const result = await publishCompetitionAction(COMPETITION_ID);

    expect(result).toEqual({ ok: true });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/competitions");
  });

  it("updateCompetitionSettingsAction rejects maxTrades below minQualifyingTrades without calling the service", async () => {
    const result = await updateCompetitionSettingsAction({ minQualifyingTrades: 10, maxTrades: 5, entryWindowPct: 50 });

    expect(result.ok).toBe(false);
    expect(mockUpdateCompetitionSettingsForAdmin).not.toHaveBeenCalled();
  });

  it("updateCompetitionSettingsAction updates and revalidates", async () => {
    mockUpdateCompetitionSettingsForAdmin.mockResolvedValueOnce(VALID_SETTINGS_INPUT);

    const result = await updateCompetitionSettingsAction(VALID_SETTINGS_INPUT);

    expect(result).toEqual({ ok: true });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/competitions");
  });
});
