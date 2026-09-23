// SettingsPage is a Server Component - just an async function returning a
// React element tree, not something rendered to a DOM. It can be called
// directly and its returned tree inspected, without jsdom/RTL (this
// codebase has no Server-Component-rendering test setup yet - Playwright
// covers real browser rendering, see CLAUDE.md's pnpm test:e2e).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireStaff = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireStaff: (permission: unknown) => mockRequireStaff(permission),
}));

const mockRoleHasPermission = vi.fn();
vi.mock("@/server/staff/repo", () => ({
  roleHasPermission: (roleId: unknown, permission: unknown) => mockRoleHasPermission(roleId, permission),
}));

const mockListRewardRulesForAdmin = vi.fn();
const mockGetVmIssuanceMultiplier = vi.fn();
vi.mock("@/server/economy/service", () => ({
  listRewardRulesForAdmin: () => mockListRewardRulesForAdmin(),
  getVmIssuanceMultiplier: () => mockGetVmIssuanceMultiplier(),
}));

vi.mock("@/server/leveling/service", () => ({
  getLevelCurveSettings: () => Promise.resolve({ baseXp: 300, stepXp: 100 }),
}));
vi.mock("@/server/rank-titles/service", () => ({
  listRankTitlesForAdmin: () => Promise.resolve([]),
}));
vi.mock("@/server/settings/service", () => ({
  getLessonFlowScoringSettings: () => Promise.resolve({}),
}));
vi.mock("@/server/streaks/service", () => ({
  getStreaksSettings: () => Promise.resolve({ streakFreezesPerMonth: 2 }),
}));

// The editor components pull in a lot of client-component/UI-library
// machinery that isn't relevant here - stub them to plain markers so the
// test can look for their presence in the returned tree without dragging
// all of that in.
vi.mock("./economy-settings-editor", () => ({ EconomySettingsEditor: () => null }));
vi.mock("./level-curve-settings-editor", () => ({ LevelCurveSettingsEditor: () => null }));
vi.mock("./rank-titles-editor", () => ({ RankTitlesEditor: () => null }));
vi.mock("./scoring-settings-editor", () => ({ ScoringSettingsEditor: () => null }));
vi.mock("./streaks-settings-editor", () => ({ StreaksSettingsEditor: () => null }));

import SettingsPage from "./page";

const STAFF = { id: "staff_1", roleId: "role_1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStaff.mockResolvedValue(STAFF);
  mockListRewardRulesForAdmin.mockResolvedValue([]);
  mockGetVmIssuanceMultiplier.mockResolvedValue(1.0);
});

// Finds any element in the tree (element or array of elements) whose
// component's name matches - a plain, dependency-free way to check "is
// this subtree present" without a DOM.
function containsComponentNamed(node: unknown, name: string): boolean {
  if (!node) return false;
  if (Array.isArray(node)) return node.some((n) => containsComponentNamed(n, name));
  if (typeof node !== "object") return false;
  const el = node as { type?: { name?: string }; props?: { children?: unknown } };
  if (el.type?.name === name) return true;
  return containsComponentNamed(el.props?.children, name);
}

describe("SettingsPage - economy.manage gates the reward-rules/VM-multiplier editors", () => {
  it("shows the economy editors for a viewer who holds economy.manage", async () => {
    mockRoleHasPermission.mockResolvedValueOnce(true);

    const tree = await SettingsPage();

    expect(containsComponentNamed(tree, "EconomyManagedSettings")).toBe(true);
    expect(mockRoleHasPermission).toHaveBeenCalledWith("role_1", "economy.manage");
  });

  it("hides the economy editors for a settings.manage-only viewer without economy.manage", async () => {
    mockRoleHasPermission.mockResolvedValueOnce(false);

    const tree = await SettingsPage();

    expect(containsComponentNamed(tree, "EconomyManagedSettings")).toBe(false);
  });

  it("still shows the other editors (scoring/streaks/level-curve/rank-titles) regardless of economy.manage", async () => {
    mockRoleHasPermission.mockResolvedValueOnce(false);

    const tree = await SettingsPage();

    expect(containsComponentNamed(tree, "ScoringSettingsEditor")).toBe(true);
    expect(containsComponentNamed(tree, "StreaksSettingsEditor")).toBe(true);
    expect(containsComponentNamed(tree, "LevelCurveSettingsEditor")).toBe(true);
    expect(containsComponentNamed(tree, "RankTitlesEditor")).toBe(true);
  });
});
