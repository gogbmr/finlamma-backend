// WorldsPage is a Server Component - just an async function returning a
// React element tree, not something rendered to a DOM - same pattern
// src/app/admin/(dashboard)/settings/page.test.tsx already uses.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetStaffMember = vi.fn();
vi.mock("@/lib/auth", () => ({ getStaffMember: () => mockGetStaffMember() }));

const mockRoleHasPermission = vi.fn();
vi.mock("@/server/staff/repo", () => ({
  roleHasPermission: (roleId: unknown, permission: unknown) => mockRoleHasPermission(roleId, permission),
}));

const mockGetMentorEditorData = vi.fn();
vi.mock("@/server/mentors/service", () => ({
  getMentorEditorData: () => mockGetMentorEditorData(),
}));

const mockGetWorldEditorData = vi.fn();
vi.mock("@/server/worlds/service", () => ({
  getWorldEditorData: () => mockGetWorldEditorData(),
}));

// Dependency-free stub, same convention settings/page.test.tsx uses - this
// test only cares about what data reaches it, not how it renders. The list
// page is table-only now (Task: view/edit/delete icons + dedicated pages) -
// it no longer fetches per-world Doubt Zone lessons itself, so there's no
// getLessonEditorData mock here anymore - see worlds/[id]/edit/page.test.tsx
// for that coverage.
vi.mock("./worlds-table", () => ({ WorldsTable: () => null }));

import WorldsPage from "./page";

const STAFF = { id: "staff_1", roleId: "role_1" };

function world(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "world_1",
    order: 1,
    code: "MW",
    title: { en: "Money World", hi: "a", hx: "a" },
    tagline: { en: "a", hi: "a", hx: "a" },
    theme: "blue",
    displayXpTarget: 1000,
    mentorId: "mentor_1",
    status: "published",
    artUrl: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetStaffMember.mockResolvedValue(STAFF);
  mockRoleHasPermission.mockResolvedValue(true);
  mockGetMentorEditorData.mockResolvedValue([]);
});

describe("WorldsPage", () => {
  it("shows Forbidden when the staff member has neither world.manage nor world.publish", async () => {
    mockRoleHasPermission.mockResolvedValue(false);
    mockGetWorldEditorData.mockResolvedValue([world()]);

    const result = await WorldsPage();

    expect((result as { props?: { message?: string } }).props?.message).toMatch(/permission/i);
  });

  it("fetches worlds and mentors for the table", async () => {
    mockGetWorldEditorData.mockResolvedValue([
      world({ id: "world_1" }),
      world({ id: "world_2" }),
    ]);

    await WorldsPage();

    expect(mockGetWorldEditorData).toHaveBeenCalledTimes(1);
    expect(mockGetMentorEditorData).toHaveBeenCalledTimes(1);
  });
});
