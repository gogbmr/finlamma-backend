// @vitest-environment jsdom
// Task: Actions column (view/edit/delete icons) replacing the old
// select-a-row-to-edit-below pattern - same confirm-before-destructive-
// action convention as Task 7's other dialogs (see e.g.
// rewards/recent-claims.test.tsx).
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorldsTable, type WorldTableRow } from "./worlds-table";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/worlds",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const mockDeleteWorldAction = vi.fn();
vi.mock("./actions", () => ({
  deleteWorldAction: (input: unknown) => mockDeleteWorldAction(input),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ROW: WorldTableRow = {
  id: "world_1",
  order: 1,
  code: "MW",
  title: { en: "Money World", hi: "a", hx: "a" },
  status: "draft",
  mentorId: "mentor_1",
};

function renderTable(overrides: Partial<React.ComponentProps<typeof WorldsTable>> = {}) {
  return render(
    <WorldsTable
      rows={[ROW]}
      mentors={[]}
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

describe("WorldsTable - Actions column", () => {
  it("renders View and Edit links pointing at the dedicated pages", () => {
    renderTable();

    expect(screen.getByRole("link", { name: /view money world/i })).toHaveAttribute(
      "href",
      "/admin/worlds/world_1",
    );
    expect(screen.getByRole("link", { name: /edit money world/i })).toHaveAttribute(
      "href",
      "/admin/worlds/world_1/edit",
    );
  });

  it("hides the Delete icon without canDelete", () => {
    renderTable({ canDelete: false });

    expect(screen.queryByRole("button", { name: /delete money world/i })).not.toBeInTheDocument();
  });

  it("Cancel on the confirm dialog sends nothing - the action is never called", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: /delete money world/i }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/money world/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(mockDeleteWorldAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("confirming the dialog calls deleteWorldAction with the row's id", async () => {
    mockDeleteWorldAction.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: /delete money world/i }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(mockDeleteWorldAction).toHaveBeenCalledWith({ id: "world_1" });
  });
});
