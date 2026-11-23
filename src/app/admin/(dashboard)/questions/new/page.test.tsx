// Same convention as worlds/new/page.test.tsx and lessons/new/page.test.tsx
// - a Server Component is just an async function returning a React element
// tree, not something rendered to a DOM.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetStaffMember = vi.fn();
vi.mock("@/lib/auth", () => ({ getStaffMember: () => mockGetStaffMember() }));

const mockRoleHasPermission = vi.fn();
vi.mock("@/server/staff/repo", () => ({
  roleHasPermission: (roleId: unknown, permission: unknown) => mockRoleHasPermission(roleId, permission),
}));

const mockListActiveTopicsForPicker = vi.fn();
vi.mock("@/server/topics/service", () => ({
  listActiveTopicsForPicker: () => mockListActiveTopicsForPicker(),
}));

vi.mock("../question-editor", () => ({ NewQuestionForm: () => null }));

import NewQuestionPage from "./page";

const STAFF = { id: "staff_1", roleId: "role_1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetStaffMember.mockResolvedValue(STAFF);
  mockRoleHasPermission.mockResolvedValue(true);
  mockListActiveTopicsForPicker.mockResolvedValue([]);
});

describe("NewQuestionPage", () => {
  it("shows Forbidden when signed out", async () => {
    mockGetStaffMember.mockResolvedValue(null);

    const result = await NewQuestionPage();

    expect((result as { props?: { message?: string } }).props?.message).toMatch(/sign-in/i);
  });

  it("shows Forbidden without question.create", async () => {
    mockRoleHasPermission.mockResolvedValue(false);

    const result = await NewQuestionPage();

    expect(mockRoleHasPermission).toHaveBeenCalledWith("role_1", "question.create");
    expect((result as { props?: { message?: string } }).props?.message).toMatch(/permission/i);
  });

  it("fetches topics for the form when allowed", async () => {
    await NewQuestionPage();

    expect(mockListActiveTopicsForPicker).toHaveBeenCalledTimes(1);
  });
});
