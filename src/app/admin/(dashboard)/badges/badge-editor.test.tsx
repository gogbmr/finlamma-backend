// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BadgeEditor } from "./badge-editor";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/badges",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const mockUpdateBadgeDraftAction = vi.fn();
vi.mock("./actions", () => ({
  createBadgeDraftAction: vi.fn(),
  publishBadgeAction: vi.fn(),
  unpublishBadgeAction: vi.fn(),
  updateBadgeDraftAction: (input: unknown) => mockUpdateBadgeDraftAction(input),
  uploadBadgeIconAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const BADGE = {
  id: "badge-1",
  name: { en: "First Trade", hi: "x", hx: "x" },
  description: { en: "Made your first trade", hi: "x", hx: "x" },
  category: "trading" as const,
  criteria: { type: "lessons_completed", threshold: 1 },
  vmReward: 100,
  iconKey: null,
  iconUrl: null,
  status: "draft" as const,
};

function renderEditor() {
  return render(
    <BadgeEditor
      badges={[BADGE]}
      canCreate
      canEdit
      total={1}
      page={1}
      pageCount={1}
      pageSize={20}
      q=""
      sort={null}
      dir="asc"
      status={null}
    />,
  );
}

describe("BadgeEditor - Task 7 confirm-before-save", () => {
  it("Cancel on the confirm dialog sends nothing - the action is never called", async () => {
    const user = userEvent.setup();
    renderEditor();

    const vmInput = screen.getByDisplayValue("100");
    await user.clear(vmInput);
    await user.type(vmInput, "250");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/V Money reward/)).toBeInTheDocument();
    expect(within(dialog).getByText(/₹250 V Money/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(mockUpdateBadgeDraftAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("confirming the dialog calls the action with the new value", async () => {
    mockUpdateBadgeDraftAction.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    renderEditor();

    const vmInput = screen.getByDisplayValue("100");
    await user.clear(vmInput);
    await user.type(vmInput, "250");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(mockUpdateBadgeDraftAction).toHaveBeenCalledWith(expect.objectContaining({ vmReward: 250 }));
  });
});
