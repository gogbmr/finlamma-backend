// @vitest-environment jsdom
// Task: Actions column (view/edit/delete icons) replacing the old
// select-a-row-to-edit-below pattern - same confirm-before-destructive-
// action convention as worlds/worlds-table.test.tsx and
// lessons/lessons-table.test.tsx.
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionsTable } from "./questions-table";
import type { QuestionListRow } from "./question-editor";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/questions",
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() }),
}));

const mockDeleteQuestionAction = vi.fn();
vi.mock("./actions", () => ({
  deleteQuestionAction: (input: unknown) => mockDeleteQuestionAction(input),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ROW: QuestionListRow = {
  id: "question_1",
  format: "single_select",
  topicId: null,
  promptEn: "What is a stock?",
  status: "draft",
};

function renderTable(overrides: Partial<React.ComponentProps<typeof QuestionsTable>> = {}) {
  return render(
    <QuestionsTable
      rows={[ROW]}
      topics={[]}
      total={1}
      page={1}
      pageCount={1}
      pageSize={20}
      q=""
      sort="createdAt"
      dir="asc"
      format={null}
      status={null}
      topicId={null}
      canEdit
      canDelete
      {...overrides}
    />,
  );
}

describe("QuestionsTable - Actions column", () => {
  it("renders View and Edit links pointing at the dedicated pages", () => {
    renderTable();

    expect(screen.getByRole("link", { name: /view what is a stock/i })).toHaveAttribute(
      "href",
      "/admin/questions/question_1",
    );
    expect(screen.getByRole("link", { name: /edit what is a stock/i })).toHaveAttribute(
      "href",
      "/admin/questions/question_1/edit",
    );
  });

  it("hides the Delete icon without canDelete", () => {
    renderTable({ canDelete: false });

    expect(screen.queryByRole("button", { name: /delete what is a stock/i })).not.toBeInTheDocument();
  });

  it("Cancel on the confirm dialog sends nothing - the action is never called", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: /delete what is a stock/i }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/what is a stock/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(mockDeleteQuestionAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("confirming the dialog calls deleteQuestionAction with the row's id", async () => {
    mockDeleteQuestionAction.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: /delete what is a stock/i }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(mockDeleteQuestionAction).toHaveBeenCalledWith({ id: "question_1" });
  });
});
