// @vitest-environment jsdom
// Task: Actions column (view/edit/delete icons) replacing the old
// select-a-row-to-edit-below pattern - same confirm-before-destructive-
// action convention as worlds/lessons/questions' own *-table.test.tsx.
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MentorsTable, type MentorTableRow } from "./mentors-table";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/mentors",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const mockDeleteMentorAction = vi.fn();
vi.mock("./actions", () => ({
  deleteMentorAction: (input: unknown) => mockDeleteMentorAction(input),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ROW: MentorTableRow = {
  id: "mentor_1",
  key: "baby",
  order: 1,
  name: { en: "Baby Lamma", hi: "a", hx: "a" },
  status: "draft",
};

function renderTable(overrides: Partial<React.ComponentProps<typeof MentorsTable>> = {}) {
  return render(
    <MentorsTable
      rows={[ROW]}
      total={1}
      page={1}
      pageCount={1}
      pageSize={20}
      q=""
      sort={null}
      dir="asc"
      status={null}
      canEdit
      canDelete
      {...overrides}
    />,
  );
}

describe("MentorsTable - Actions column", () => {
  it("renders View and Edit links pointing at the dedicated pages", () => {
    renderTable();

    expect(screen.getByRole("link", { name: /view baby lamma/i })).toHaveAttribute(
      "href",
      "/admin/mentors/mentor_1",
    );
    expect(screen.getByRole("link", { name: /edit baby lamma/i })).toHaveAttribute(
      "href",
      "/admin/mentors/mentor_1/edit",
    );
  });

  it("hides the Delete icon without canDelete", () => {
    renderTable({ canDelete: false });

    expect(screen.queryByRole("button", { name: /delete baby lamma/i })).not.toBeInTheDocument();
  });

  it("Cancel on the confirm dialog sends nothing - the action is never called", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: /delete baby lamma/i }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/baby lamma/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(mockDeleteMentorAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("confirming the dialog calls deleteMentorAction with the row's id", async () => {
    mockDeleteMentorAction.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: /delete baby lamma/i }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(mockDeleteMentorAction).toHaveBeenCalledWith({ id: "mentor_1" });
  });
});
