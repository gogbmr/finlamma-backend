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

const mockUpdateGlobalHalt = vi.fn();
const mockUpdateFeedMode = vi.fn();
const mockUpdateInstrumentHalted = vi.fn();
vi.mock("@/server/trading/service", () => ({
  updateGlobalHalt: (...args: unknown[]) => mockUpdateGlobalHalt(...args),
  updateFeedMode: (...args: unknown[]) => mockUpdateFeedMode(...args),
  updateInstrumentHalted: (...args: unknown[]) => mockUpdateInstrumentHalted(...args),
}));

const mockUpdateRiskThresholds = vi.fn();
const mockGetUserTradingLedgerPage = vi.fn();
vi.mock("@/server/ops/service", () => ({
  updateRiskThresholds: (...args: unknown[]) => mockUpdateRiskThresholds(...args),
  getUserTradingLedgerPage: (...args: unknown[]) => mockGetUserTradingLedgerPage(...args),
}));

import {
  loadLedgerPageAction,
  setFeedModeAction,
  setGlobalHaltAction,
  setSymbolHaltedAction,
  updateRiskThresholdsAction,
} from "./actions";

const ACTOR = { id: "staff_1" };
const WRONG_ROLE_ERROR = new AppError("FORBIDDEN", "Missing permission: trading.ops");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("wrong role is rejected - every dangerous control requires trading.ops, not instrument.manage or settings.manage", () => {
  it("setGlobalHaltAction requires trading.ops", async () => {
    mockRequireStaff.mockRejectedValueOnce(WRONG_ROLE_ERROR);

    const result = await setGlobalHaltAction(true, "Suspicious activity");

    expect(result).toEqual({ ok: false, error: "Missing permission: trading.ops" });
    expect(mockRequireStaff).toHaveBeenCalledWith("trading.ops");
    expect(mockUpdateGlobalHalt).not.toHaveBeenCalled();
  });

  it("setFeedModeAction requires trading.ops", async () => {
    mockRequireStaff.mockRejectedValueOnce(WRONG_ROLE_ERROR);

    const result = await setFeedModeAction("paused");

    expect(result).toEqual({ ok: false, error: "Missing permission: trading.ops" });
    expect(mockUpdateFeedMode).not.toHaveBeenCalled();
  });

  it("setSymbolHaltedAction requires trading.ops", async () => {
    mockRequireStaff.mockRejectedValueOnce(WRONG_ROLE_ERROR);

    const result = await setSymbolHaltedAction("inst_1", true, "Unusual order flow");

    expect(result).toEqual({ ok: false, error: "Missing permission: trading.ops" });
    expect(mockUpdateInstrumentHalted).not.toHaveBeenCalled();
  });

  it("updateRiskThresholdsAction requires trading.ops", async () => {
    mockRequireStaff.mockRejectedValueOnce(WRONG_ROLE_ERROR);

    const result = await updateRiskThresholdsAction({ newAccountDays: 7, concentrationPct: 50, dailyOrderCount: 10 });

    expect(result).toEqual({ ok: false, error: "Missing permission: trading.ops" });
    expect(mockUpdateRiskThresholds).not.toHaveBeenCalled();
  });

  it("loadLedgerPageAction requires trading.ops", async () => {
    mockRequireStaff.mockRejectedValueOnce(WRONG_ROLE_ERROR);

    await expect(loadLedgerPageAction(null)).rejects.toThrow(AppError);
    expect(mockGetUserTradingLedgerPage).not.toHaveBeenCalled();
  });
});

describe("setGlobalHaltAction - mandatory reason", () => {
  it("rejects an empty reason without calling the service", async () => {
    mockRequireStaff.mockResolvedValueOnce(ACTOR);

    const result = await setGlobalHaltAction(true, "   ");

    expect(result.ok).toBe(false);
    expect(mockUpdateGlobalHalt).not.toHaveBeenCalled();
  });

  it("succeeds with a real reason and revalidates both the Ops page and the admin shell (for the banner)", async () => {
    mockRequireStaff.mockResolvedValueOnce(ACTOR);
    mockUpdateGlobalHalt.mockResolvedValueOnce({ id: "singleton", globalHalt: true });

    const result = await setGlobalHaltAction(true, "Investigating a price-feed bug");

    expect(result).toEqual({ ok: true });
    expect(mockUpdateGlobalHalt).toHaveBeenCalledWith(ACTOR, true, "Investigating a price-feed bug", expect.any(Object));
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/ops");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin");
  });
});

describe("setSymbolHaltedAction - mandatory reason", () => {
  it("rejects an empty reason without calling the service", async () => {
    mockRequireStaff.mockResolvedValueOnce(ACTOR);

    const result = await setSymbolHaltedAction("inst_1", true, "");

    expect(result.ok).toBe(false);
    expect(mockUpdateInstrumentHalted).not.toHaveBeenCalled();
  });
});

describe("setFeedModeAction - reason is optional", () => {
  it("succeeds with no reason given at all", async () => {
    mockRequireStaff.mockResolvedValueOnce(ACTOR);
    mockUpdateFeedMode.mockResolvedValueOnce({ id: "singleton", feedMode: "paused" });

    const result = await setFeedModeAction("paused");

    expect(result).toEqual({ ok: true });
    expect(mockUpdateFeedMode).toHaveBeenCalledWith(ACTOR, "paused", expect.any(Object), undefined);
  });

  it("rejects an invalid mode", async () => {
    mockRequireStaff.mockResolvedValueOnce(ACTOR);

    const result = await setFeedModeAction("ultra-fast");

    expect(result.ok).toBe(false);
    expect(mockUpdateFeedMode).not.toHaveBeenCalled();
  });
});
