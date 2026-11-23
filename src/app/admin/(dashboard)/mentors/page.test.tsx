// Same convention as worlds/page.test.tsx - a Server Component is just an
// async function returning a React element tree, not something rendered to
// a DOM.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetStaffMember = vi.fn();
vi.mock("@/lib/auth", () => ({ getStaffMember: () => mockGetStaffMember() }));

const mockGetPermissionKeysForRole = vi.fn();
vi.mock("@/server/staff/repo", () => ({
  getPermissionKeysForRole: (roleId: unknown) => mockGetPermissionKeysForRole(roleId),
}));

const mockGetMentorEditorData = vi.fn();
vi.mock("@/server/mentors/service", () => ({
  getMentorEditorData: () => mockGetMentorEditorData(),
}));

vi.mock("./mentors-table", () => ({ MentorsTable: () => null }));

import MentorsPage from "./page";

const STAFF = { id: "staff_1", roleId: "role_1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetStaffMember.mockResolvedValue(STAFF);
  mockGetPermissionKeysForRole.mockResolvedValue(
    new Set(["mentor.view", "mentor.create", "mentor.edit", "mentor.delete"]),
  );
  mockGetMentorEditorData.mockResolvedValue([]);
});

describe("MentorsPage", () => {
  it("shows Forbidden when the staff member lacks mentor.view", async () => {
    mockGetPermissionKeysForRole.mockResolvedValue(new Set());

    const result = await MentorsPage();

    expect((result as { props?: { message?: string } }).props?.message).toMatch(/permission/i);
  });

  it("fetches mentors for the table", async () => {
    await MentorsPage();

    expect(mockGetMentorEditorData).toHaveBeenCalledTimes(1);
  });
});
