// Same convention as worlds/[id]/page.test.tsx - a Server Component is
// just an async function returning a React element tree, not something
// rendered to a DOM.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetStaffMember = vi.fn();
vi.mock("@/lib/auth", () => ({ getStaffMember: () => mockGetStaffMember() }));

const mockRoleHasPermission = vi.fn();
vi.mock("@/server/staff/repo", () => ({
  roleHasPermission: (roleId: unknown, permission: unknown) => mockRoleHasPermission(roleId, permission),
}));

const mockGetStoryDetailForAdmin = vi.fn();
vi.mock("@/server/news/admin-queries", () => ({
  getStoryDetailForAdmin: (id: unknown) => mockGetStoryDetailForAdmin(id),
}));

const mockListActiveTopicsForPicker = vi.fn();
vi.mock("@/server/topics/service", () => ({
  listActiveTopicsForPicker: () => mockListActiveTopicsForPicker(),
}));

const mockNotFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => mockNotFound() }));

vi.mock("../news-view", () => ({ NewsView: () => null }));

import NewsStoryViewPage from "./page";

const STAFF = { id: "staff_1", roleId: "role_1" };
const STORY = {
  id: "story_1",
  topicId: null,
  category: "rbi_rates" as const,
  impact: "neutral" as const,
  content: {
    headline: { en: "RBI cuts rates", hi: "a", hx: "a" },
    summary: { en: "a", hi: "a", hx: "a" },
    body: [{ en: "a", hi: "a", hx: "a" }],
  },
  jargon: null,
  outlet: "Mock Times",
  sourceUrl: "https://example.com/story",
  qualityGrade: "A" as const,
  qualityGradeOverride: null,
  featured: false,
  adviceLikeWarnings: null,
  status: "draft" as const,
  publishedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetStaffMember.mockResolvedValue(STAFF);
  mockRoleHasPermission.mockResolvedValue(true);
  mockGetStoryDetailForAdmin.mockResolvedValue(STORY);
  mockListActiveTopicsForPicker.mockResolvedValue([]);
});

describe("NewsStoryViewPage", () => {
  it("shows Forbidden when signed out", async () => {
    mockGetStaffMember.mockResolvedValue(null);

    const result = await NewsStoryViewPage({ params: Promise.resolve({ id: "story_1" }) });

    expect((result as { props?: { message?: string } }).props?.message).toMatch(/sign-in/i);
  });

  it("shows Forbidden when the staff member lacks news.view", async () => {
    mockRoleHasPermission.mockResolvedValue(false);

    const result = await NewsStoryViewPage({ params: Promise.resolve({ id: "story_1" }) });

    expect((result as { props?: { message?: string } }).props?.message).toMatch(/permission/i);
  });

  it("calls notFound for an id that doesn't match any story", async () => {
    mockGetStoryDetailForAdmin.mockResolvedValue(null);

    await expect(
      NewsStoryViewPage({ params: Promise.resolve({ id: "does-not-exist" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it("resolves the matching story for a valid id", async () => {
    await NewsStoryViewPage({ params: Promise.resolve({ id: "story_1" }) });

    expect(mockGetStoryDetailForAdmin).toHaveBeenCalledWith("story_1");
  });
});
