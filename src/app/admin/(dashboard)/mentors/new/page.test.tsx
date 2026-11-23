// Same convention as worlds/new/page.test.tsx - a Server Component is just
// an async function returning a React element tree, not something rendered
// to a DOM.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetStaffMember = vi.fn();
vi.mock("@/lib/auth", () => ({ getStaffMember: () => mockGetStaffMember() }));

const mockRoleHasPermission = vi.fn();
vi.mock("@/server/staff/repo", () => ({
  roleHasPermission: (roleId: unknown, permission: unknown) => mockRoleHasPermission(roleId, permission),
}));

vi.mock("../mentor-editor", () => ({ NewMentorForm: () => null }));

import NewMentorPage from "./page";

const STAFF = { id: "staff_1", roleId: "role_1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetStaffMember.mockResolvedValue(STAFF);
  mockRoleHasPermission.mockResolvedValue(true);
});

describe("NewMentorPage", () => {
  it("shows Forbidden when signed out", async () => {
    mockGetStaffMember.mockResolvedValue(null);

    const result = await NewMentorPage();

    expect((result as { props?: { message?: string } }).props?.message).toMatch(/sign-in/i);
  });

  it("shows Forbidden without mentor.create", async () => {
    mockRoleHasPermission.mockResolvedValue(false);

    const result = await NewMentorPage();

    expect(mockRoleHasPermission).toHaveBeenCalledWith("role_1", "mentor.create");
    expect((result as { props?: { message?: string } }).props?.message).toMatch(/permission/i);
  });
});
