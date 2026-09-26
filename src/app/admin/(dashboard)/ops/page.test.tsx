// OpsConsolePage is a Server Component - just an async function returning a
// React element tree, not something rendered to a DOM (see
// src/app/admin/(dashboard)/settings/page.test.tsx's own comment).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireStaff = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireStaff: (permission: unknown) => mockRequireStaff(permission),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

const mockGetMarketControls = vi.fn();
const mockGetInstrumentEditorData = vi.fn();
vi.mock("@/server/trading/service", () => ({
  getMarketControls: () => mockGetMarketControls(),
  getInstrumentEditorData: () => mockGetInstrumentEditorData(),
}));

const mockGetOpsKpis = vi.fn();
const mockGetRiskThresholds = vi.fn();
const mockGetUserTradingLedgerPage = vi.fn();
const mockGetRecentOpsEvents = vi.fn();
vi.mock("@/server/ops/service", () => ({
  getOpsKpis: () => mockGetOpsKpis(),
  getRiskThresholds: () => mockGetRiskThresholds(),
  getUserTradingLedgerPage: (...args: unknown[]) => mockGetUserTradingLedgerPage(...args),
  getRecentOpsEvents: () => mockGetRecentOpsEvents(),
}));

// The editor components pull in client-component/UI-library machinery not
// relevant here - stub to plain markers, same approach as the settings
// page test.
vi.mock("./feed-halt-control", () => ({ FeedHaltControl: () => null }));
vi.mock("./symbol-master-table", () => ({ SymbolMasterTable: () => null }));
vi.mock("./risk-thresholds-editor", () => ({ RiskThresholdsEditor: () => null }));
vi.mock("./user-ledger-table", () => ({ UserLedgerTable: () => null }));

import OpsConsolePage from "./page";

const ACTOR = { id: "staff_1" };

// Finds any element in the tree whose component's name matches - a plain,
// dependency-free way to check "is this subtree present" without a DOM
// (same helper as src/app/admin/(dashboard)/settings/page.test.tsx).
function containsComponentNamed(node: unknown, name: string): boolean {
  if (!node) return false;
  if (Array.isArray(node)) return node.some((n) => containsComponentNamed(n, name));
  if (typeof node !== "object") return false;
  const el = node as { type?: { name?: string }; props?: { children?: unknown } };
  if (el.type?.name === name) return true;
  return containsComponentNamed(el.props?.children, name);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStaff.mockResolvedValue(ACTOR);
  mockGetMarketControls.mockResolvedValue({ id: "singleton", feedMode: "live", globalHalt: false });
  mockGetInstrumentEditorData.mockResolvedValue([]);
  mockGetOpsKpis.mockResolvedValue({ activeTradersToday: 0, ordersToday: 0, vmoneyInPlayPaise: 0, riskFlagsCount: 0 });
  mockGetRiskThresholds.mockResolvedValue({ newAccountDays: 7, concentrationPct: 50, dailyOrderCount: 10 });
  mockGetUserTradingLedgerPage.mockResolvedValue({ data: [], nextCursor: null });
  mockGetRecentOpsEvents.mockResolvedValue([]);
});

describe("OpsConsolePage - gated on trading.ops, not instrument.manage or settings.manage", () => {
  it("shows Forbidden for a viewer without trading.ops", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: trading.ops"));

    const tree = await OpsConsolePage();

    expect(mockRequireStaff).toHaveBeenCalledWith("trading.ops");
    expect(mockGetOpsKpis).not.toHaveBeenCalled();
    expect(containsComponentNamed(tree, "Forbidden")).toBe(true);
  });

  it("renders the console for a viewer who holds trading.ops, without throwing", async () => {
    const tree = await OpsConsolePage();

    expect(tree).toBeTruthy();
    expect(mockGetUserTradingLedgerPage).toHaveBeenCalledWith(ACTOR, {}, expect.any(Object));
  });
});
