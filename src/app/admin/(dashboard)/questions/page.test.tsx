// Same convention as worlds/page.test.tsx and lessons/page.test.tsx - a
// Server Component is just an async function returning a React element
// tree, not something rendered to a DOM.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetStaffMember = vi.fn();
vi.mock("@/lib/auth", () => ({ getStaffMember: () => mockGetStaffMember() }));

const mockGetPermissionKeysForRole = vi.fn();
vi.mock("@/server/staff/repo", () => ({
  getPermissionKeysForRole: (roleId: unknown) => mockGetPermissionKeysForRole(roleId),
}));

const mockListQuestionsForAdmin = vi.fn();
vi.mock("@/server/questions/admin-queries", () => ({
  QUESTION_ADMIN_SORT_COLUMNS: ["createdAt", "format", "status"],
  listQuestionsForAdmin: (input: unknown) => mockListQuestionsForAdmin(input),
}));

const mockListActiveTopicsForPicker = vi.fn();
vi.mock("@/server/topics/service", () => ({
  listActiveTopicsForPicker: () => mockListActiveTopicsForPicker(),
}));

vi.mock("./questions-table", () => ({ QuestionsTable: () => null }));

import QuestionsPage from "./page";

const STAFF = { id: "staff_1", roleId: "role_1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetStaffMember.mockResolvedValue(STAFF);
  mockGetPermissionKeysForRole.mockResolvedValue(
    new Set(["question.view", "question.create", "question.edit", "question.delete"]),
  );
  mockListActiveTopicsForPicker.mockResolvedValue([]);
  mockListQuestionsForAdmin.mockResolvedValue({ rows: [], total: 0, page: 1, pageCount: 1 });
});

describe("QuestionsPage", () => {
  it("shows Forbidden when the staff member lacks question.view", async () => {
    mockGetPermissionKeysForRole.mockResolvedValue(new Set());

    const result = await QuestionsPage({ searchParams: Promise.resolve({}) });

    expect((result as { props?: { message?: string } }).props?.message).toMatch(/permission/i);
  });

  it("fetches questions and topics", async () => {
    await QuestionsPage({ searchParams: Promise.resolve({}) });

    expect(mockListQuestionsForAdmin).toHaveBeenCalledTimes(1);
    expect(mockListActiveTopicsForPicker).toHaveBeenCalledTimes(1);
  });
});
