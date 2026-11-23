// Same convention as worlds/new/page.test.tsx - a Server Component is just
// an async function returning a React element tree, not something rendered
// to a DOM. renderToStaticMarkup (not JSON.stringify - the tree contains
// circular refs through component types) turns it into a plain string for
// a text-content assertion.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetStaffMember = vi.fn();
vi.mock("@/lib/auth", () => ({ getStaffMember: () => mockGetStaffMember() }));

const mockRoleHasPermission = vi.fn();
vi.mock("@/server/staff/repo", () => ({
  roleHasPermission: (roleId: unknown, permission: unknown) => mockRoleHasPermission(roleId, permission),
}));

const mockGetWorldEditorData = vi.fn();
vi.mock("@/server/worlds/service", () => ({
  getWorldEditorData: () => mockGetWorldEditorData(),
}));

vi.mock("../lesson-editor", () => ({ NewLessonForm: () => null }));

import NewLessonPage from "./page";

const STAFF = { id: "staff_1", roleId: "role_1" };
const WORLD = {
  id: "world_1",
  order: 1,
  title: { en: "Money World", hi: "a", hx: "a" },
  mentorId: "mentor_1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetStaffMember.mockResolvedValue(STAFF);
  mockRoleHasPermission.mockResolvedValue(true);
  mockGetWorldEditorData.mockResolvedValue([WORLD]);
});

describe("NewLessonPage", () => {
  it("shows Forbidden when signed out", async () => {
    mockGetStaffMember.mockResolvedValue(null);

    const result = await NewLessonPage({ searchParams: Promise.resolve({ worldId: "world_1" }) });

    expect((result as { props?: { message?: string } }).props?.message).toMatch(/sign-in/i);
  });

  it("shows Forbidden without lesson.create", async () => {
    mockRoleHasPermission.mockResolvedValue(false);

    const result = await NewLessonPage({ searchParams: Promise.resolve({ worldId: "world_1" }) });

    expect(mockRoleHasPermission).toHaveBeenCalledWith("role_1", "lesson.create");
    expect((result as { props?: { message?: string } }).props?.message).toMatch(/permission/i);
  });

  it("prompts to pick a world first when worldId is missing or invalid", async () => {
    const result = await NewLessonPage({ searchParams: Promise.resolve({}) });

    expect(renderToStaticMarkup(result as React.ReactElement)).toMatch(/pick a world/i);
  });

  it("renders the form when a valid worldId is given", async () => {
    const result = await NewLessonPage({ searchParams: Promise.resolve({ worldId: "world_1" }) });

    expect(renderToStaticMarkup(result as React.ReactElement)).not.toMatch(/pick a world/i);
  });
});
