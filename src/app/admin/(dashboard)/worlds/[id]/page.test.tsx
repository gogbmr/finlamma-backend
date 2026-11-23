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

const mockGetWorldEditorData = vi.fn();
vi.mock("@/server/worlds/service", () => ({
  getWorldEditorData: () => mockGetWorldEditorData(),
}));

const mockNotFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => mockNotFound() }));

vi.mock("../world-view", () => ({ WorldView: () => null }));

import WorldViewPage from "./page";

const STAFF = { id: "staff_1", roleId: "role_1" };

function world(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "world_1",
    order: 1,
    code: "MW",
    title: { en: "Money World", hi: "a", hx: "a" },
    tagline: { en: "a", hi: "a", hx: "a" },
    theme: "#7C3AED",
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
  mockGetPermissionKeysForRole.mockResolvedValue(
    new Set(["world.view", "world.create", "world.edit", "world.delete"]),
  );
  mockGetMentorEditorData.mockResolvedValue([]);
  mockGetWorldEditorData.mockResolvedValue([world()]);
});

describe("WorldViewPage", () => {
  it("shows Forbidden when signed out", async () => {
    mockGetStaffMember.mockResolvedValue(null);

    const result = await WorldViewPage({ params: Promise.resolve({ id: "world_1" }) });

    expect((result as { props?: { message?: string } }).props?.message).toMatch(/sign-in/i);
  });

  it("shows Forbidden when the staff member lacks world.view", async () => {
    mockGetPermissionKeysForRole.mockResolvedValue(new Set());

    const result = await WorldViewPage({ params: Promise.resolve({ id: "world_1" }) });

    expect((result as { props?: { message?: string } }).props?.message).toMatch(/permission/i);
  });

  it("calls notFound for an id that doesn't match any world", async () => {
    await expect(
      WorldViewPage({ params: Promise.resolve({ id: "does-not-exist" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it("resolves the matching world and its mentor for a valid id", async () => {
    mockGetMentorEditorData.mockResolvedValue([
      { id: "mentor_1", key: "father_lamma", name: { en: "Father Lamma", hi: "a", hx: "a" }, status: "published" },
    ]);

    await WorldViewPage({ params: Promise.resolve({ id: "world_1" }) });

    expect(mockGetWorldEditorData).toHaveBeenCalledTimes(1);
    expect(mockGetMentorEditorData).toHaveBeenCalledTimes(1);
  });
});
