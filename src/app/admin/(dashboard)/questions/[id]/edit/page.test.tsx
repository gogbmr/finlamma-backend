// Same convention as worlds/[id]/edit/page.test.tsx and
// lessons/[id]/edit/page.test.tsx - a Server Component is just an async
// function returning a React element tree, not something rendered to a DOM.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetStaffMember = vi.fn();
vi.mock("@/lib/auth", () => ({ getStaffMember: () => mockGetStaffMember() }));

const mockGetPermissionKeysForRole = vi.fn();
vi.mock("@/server/staff/repo", () => ({
  getPermissionKeysForRole: (roleId: unknown) => mockGetPermissionKeysForRole(roleId),
}));

const mockGetQuestionDetailForAdmin = vi.fn();
vi.mock("@/server/questions/admin-queries", () => ({
  getQuestionDetailForAdmin: (id: unknown) => mockGetQuestionDetailForAdmin(id),
}));

const mockListActiveTopicsForPicker = vi.fn();
vi.mock("@/server/topics/service", () => ({
  listActiveTopicsForPicker: () => mockListActiveTopicsForPicker(),
}));

const mockNotFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => mockNotFound() }));

vi.mock("../../question-editor", () => ({ QuestionForm: () => null }));

import EditQuestionPage from "./page";

const STAFF = { id: "staff_1", roleId: "role_1" };
const QUESTION = {
  id: "question_1",
  format: "single_select" as const,
  topicId: null,
  prompt: { en: "What is a stock?", hi: "a", hx: "a" },
  explanation: { en: "x", hi: "a", hx: "a" },
  payload: { options: [] },
  answer: { correctIndex: 0 },
  status: "draft" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetStaffMember.mockResolvedValue(STAFF);
  mockGetPermissionKeysForRole.mockResolvedValue(
    new Set(["question.view", "question.create", "question.edit", "question.delete"]),
  );
  mockGetQuestionDetailForAdmin.mockResolvedValue(QUESTION);
  mockListActiveTopicsForPicker.mockResolvedValue([]);
});

describe("EditQuestionPage", () => {
  it("shows Forbidden when signed out", async () => {
    mockGetStaffMember.mockResolvedValue(null);

    const result = await EditQuestionPage({ params: Promise.resolve({ id: "question_1" }) });

    expect((result as { props?: { message?: string } }).props?.message).toMatch(/sign-in/i);
  });

  it("shows Forbidden when the staff member has neither question.edit nor question.delete", async () => {
    mockGetPermissionKeysForRole.mockResolvedValue(new Set());

    const result = await EditQuestionPage({ params: Promise.resolve({ id: "question_1" }) });

    expect((result as { props?: { message?: string } }).props?.message).toMatch(/permission/i);
  });

  it("calls notFound for an id that doesn't match any question", async () => {
    mockGetQuestionDetailForAdmin.mockResolvedValue(null);

    await expect(
      EditQuestionPage({ params: Promise.resolve({ id: "does-not-exist" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it("resolves the matching question and topics for a valid id", async () => {
    await EditQuestionPage({ params: Promise.resolve({ id: "question_1" }) });

    expect(mockGetQuestionDetailForAdmin).toHaveBeenCalledWith("question_1");
    expect(mockListActiveTopicsForPicker).toHaveBeenCalledTimes(1);
  });
});
