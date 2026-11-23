// @vitest-environment jsdom
// Task: Actions column (view/edit/delete icons) replacing the old
// select-a-row-to-edit-below pattern - same confirm-before-destructive-
// action convention as worlds/worlds-table.test.tsx.
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LessonsTable, type LessonTableRow } from "./lessons-table";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/lessons",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const mockDeleteLessonAction = vi.fn();
vi.mock("./actions", () => ({
  deleteLessonAction: (input: unknown) => mockDeleteLessonAction(input),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ROW: LessonTableRow = {
  id: "lesson_1",
  worldId: "world_1",
  worldTitle: { en: "Money World", hi: "a", hx: "a" },
  chapter: 1,
  step: 1,
  kind: "video",
  title: { en: "Intro to Money", hi: "a", hx: "a" },
  status: "draft",
};

function renderTable(overrides: Partial<React.ComponentProps<typeof LessonsTable>> = {}) {
  return render(
    <LessonsTable
      worldId="world_1"
      rows={[ROW]}
      total={1}
      page={1}
      pageCount={1}
      pageSize={20}
      q=""
      sort={null}
      dir="asc"
      kind={null}
      status={null}
      canEdit
      canDelete
      showWorldColumn={false}
      {...overrides}
    />,
  );
}

describe("LessonsTable - Actions column", () => {
  it("renders View and Edit links pointing at the dedicated pages", () => {
    renderTable();

    expect(screen.getByRole("link", { name: /view intro to money/i })).toHaveAttribute(
      "href",
      "/admin/lessons/lesson_1",
    );
    expect(screen.getByRole("link", { name: /edit intro to money/i })).toHaveAttribute(
      "href",
      "/admin/lessons/lesson_1/edit",
    );
  });

  it("hides the Delete icon without canDelete", () => {
    renderTable({ canDelete: false });

    expect(screen.queryByRole("button", { name: /delete intro to money/i })).not.toBeInTheDocument();
  });

  it("shows a World column only when showWorldColumn is true", () => {
    renderTable({ showWorldColumn: true });
    expect(screen.getByText("Money World")).toBeInTheDocument();
  });

  it("Cancel on the confirm dialog sends nothing - the action is never called", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: /delete intro to money/i }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/intro to money/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(mockDeleteLessonAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("confirming the dialog calls deleteLessonAction with the row's id", async () => {
    mockDeleteLessonAction.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: /delete intro to money/i }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(mockDeleteLessonAction).toHaveBeenCalledWith({ id: "lesson_1" });
  });
});
