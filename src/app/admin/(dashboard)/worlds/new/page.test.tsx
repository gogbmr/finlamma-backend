// Same convention as worlds/page.test.tsx - a Server Component is just an
// async function returning a React element tree, not something rendered to
// a DOM.
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

vi.mock("../world-editor", () => ({ NewWorldForm: () => null }));

import NewWorldPage from "./page";

const STAFF = { id: "staff_1", roleId: "role_1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetStaffMember.mockResolvedValue(STAFF);
  mockRoleHasPermission.mockResolvedValue(true);
  mockGetMentorEditorData.mockResolvedValue([]);
});

describe("NewWorldPage", () => {
  it("shows Forbidden when signed out", async () => {
    mockGetStaffMember.mockResolvedValue(null);

    const result = await NewWorldPage();

    expect((result as { props?: { message?: string } }).props?.message).toMatch(/sign-in/i);
  });

  it("shows Forbidden without world.manage - world.publish alone isn't enough to create", async () => {
    mockRoleHasPermission.mockResolvedValue(false);

    const result = await NewWorldPage();

    expect(mockRoleHasPermission).toHaveBeenCalledWith("role_1", "world.manage");
    expect(mockGetMentorEditorData).not.toHaveBeenCalled();
    expect((result as { props?: { message?: string } }).props?.message).toMatch(/permission/i);
  });

  it("fetches mentors for the form when allowed", async () => {
    await NewWorldPage();

    expect(mockGetMentorEditorData).toHaveBeenCalledTimes(1);
  });
});
