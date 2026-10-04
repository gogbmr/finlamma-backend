// AnalyticsDashboardPage is a Server Component - just an async function
// returning a React element tree, not something rendered to a DOM. Called
// directly, same pattern as ../settings/page.test.tsx.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetStaffMember = vi.fn();
vi.mock("@/lib/auth", () => ({ getStaffMember: () => mockGetStaffMember() }));

const mockRoleHasPermission = vi.fn();
vi.mock("@/server/staff/repo", () => ({
  roleHasPermission: (roleId: unknown, permission: unknown) => mockRoleHasPermission(roleId, permission),
}));

const mockGetAdminAnalyticsSummary = vi.fn();
vi.mock("@/server/analytics/service", () => ({
  getAdminAnalyticsSummary: () => mockGetAdminAnalyticsSummary(),
}));

import AnalyticsDashboardPage from "./page";

const STAFF = { id: "staff_1", roleId: "role_1" };
const SUMMARY = {
  users: { totalActive: 10, newToday: 1, newLast7Days: 3 },
  retention: { dau: 4, wau: 6, mau: 8 },
  lessons: { completedToday: 2, completedLast7Days: 9 },
  trading: { activeTradersToday: 1, ordersToday: 2 },
  news: { pulseCheckEngagementPct7Day: 50, pulseCheckActiveUsers: 5 },
  revenue: { activeAdFreeEntitlements: 1, newPurchasesLast7Days: 1 },
};

function flattenText(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join(" ");
  if (typeof node === "object" && "props" in (node as Record<string, unknown>)) {
    const props = (node as { props?: Record<string, unknown> }).props ?? {};
    // Forbidden (src/components/admin/forbidden.tsx) takes its text as a
    // `message` prop, not JSX children - this tree is never actually
    // rendered by React (no createElement evaluation of child components),
    // so Forbidden's own internal markup never runs; read the prop directly.
    const messageProp = typeof props.message === "string" ? props.message : "";
    return [messageProp, flattenText(props.children)].filter(Boolean).join(" ");
  }
  return "";
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AnalyticsDashboardPage", () => {
  it("shows Forbidden when not signed in as staff", async () => {
    mockGetStaffMember.mockResolvedValueOnce(null);

    const tree = await AnalyticsDashboardPage();

    expect(flattenText(tree)).toMatch(/sign-in required/i);
    expect(mockGetAdminAnalyticsSummary).not.toHaveBeenCalled();
  });

  it("shows Forbidden for staff without analytics.view", async () => {
    mockGetStaffMember.mockResolvedValueOnce(STAFF);
    mockRoleHasPermission.mockResolvedValueOnce(false);

    const tree = await AnalyticsDashboardPage();

    expect(flattenText(tree)).toMatch(/don't have permission/i);
    expect(mockGetAdminAnalyticsSummary).not.toHaveBeenCalled();
  });

  it("renders the summary's tiles for a viewer who holds analytics.view", async () => {
    mockGetStaffMember.mockResolvedValueOnce(STAFF);
    mockRoleHasPermission.mockResolvedValueOnce(true);
    mockGetAdminAnalyticsSummary.mockResolvedValueOnce(SUMMARY);

    const tree = await AnalyticsDashboardPage();
    const text = flattenText(tree);

    expect(mockRoleHasPermission).toHaveBeenCalledWith("role_1", "analytics.view");
    expect(text).toMatch(/Users/);
    expect(text).toMatch(/Retention/);
    expect(text).toMatch(/Trading/);
    expect(text).toMatch(/Revenue/);
    // Never a per-user identifier anywhere in the rendered output.
    expect(text).not.toMatch(/userId|clerkUserId|@.*\.com/i);
  });
});
