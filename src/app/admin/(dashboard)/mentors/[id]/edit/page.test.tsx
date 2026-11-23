// Same convention as worlds/[id]/edit/page.test.tsx - a Server Component
// is just an async function returning a React element tree, not something
// rendered to a DOM.
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

const mockNotFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => mockNotFound() }));

vi.mock("../../mentor-editor", () => ({ MentorForm: () => null }));

import EditMentorPage from "./page";

const STAFF = { id: "staff_1", roleId: "role_1" };

function mentor(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "mentor_1",
    key: "baby",
    order: 1,
    name: { en: "Baby Lamma", hi: "a", hx: "a" },
    bio: { en: "a", hi: "a", hx: "a" },
    persona: "test persona",
    status: "draft" as const,
    artUrl: null,
    usedByWorlds: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetStaffMember.mockResolvedValue(STAFF);
  mockGetPermissionKeysForRole.mockResolvedValue(
    new Set(["mentor.view", "mentor.create", "mentor.edit", "mentor.delete"]),
  );
  mockGetMentorEditorData.mockResolvedValue([mentor()]);
});

describe("EditMentorPage", () => {
  it("shows Forbidden when signed out", async () => {
    mockGetStaffMember.mockResolvedValue(null);

    const result = await EditMentorPage({ params: Promise.resolve({ id: "mentor_1" }) });

    expect((result as { props?: { message?: string } }).props?.message).toMatch(/sign-in/i);
  });

  it("shows Forbidden when the staff member has neither mentor.edit nor mentor.delete", async () => {
    mockGetPermissionKeysForRole.mockResolvedValue(new Set());

    const result = await EditMentorPage({ params: Promise.resolve({ id: "mentor_1" }) });

    expect((result as { props?: { message?: string } }).props?.message).toMatch(/permission/i);
  });

  it("calls notFound for an id that doesn't match any mentor", async () => {
    await expect(
      EditMentorPage({ params: Promise.resolve({ id: "does-not-exist" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it("resolves the matching mentor for a valid id", async () => {
    await EditMentorPage({ params: Promise.resolve({ id: "mentor_1" }) });

    expect(mockGetMentorEditorData).toHaveBeenCalledTimes(1);
  });
});
