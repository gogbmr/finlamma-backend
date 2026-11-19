// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RewardEditor } from "./reward-editor";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/rewards",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const mockUpdateRewardDraftAction = vi.fn();
vi.mock("./actions", () => ({
  createRewardDraftAction: vi.fn(),
  publishRewardAction: vi.fn(),
  unpublishRewardAction: vi.fn(),
  updateRewardDraftAction: (input: unknown) => mockUpdateRewardDraftAction(input),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const REWARD = {
  id: "reward-1",
  name: { en: "Dark theme", hi: "x", hx: "x" },
  description: { en: "Unlock a dark theme", hi: "x", hx: "x" },
  category: "finlamma" as const,
  priceVm: 500,
  iconKey: null,
  status: "draft" as const,
};

function renderEditor() {
  return render(
    <RewardEditor
      rewards={[REWARD]}
      canManage
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

describe("RewardEditor - Task 7 confirm-before-save", () => {
  it("Cancel on the confirm dialog sends nothing - the action is never called", async () => {
    const user = userEvent.setup();
    renderEditor();

    const priceInput = screen.getByDisplayValue("500");
    await user.clear(priceInput);
    await user.type(priceInput, "750");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/₹750 V Money/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(mockUpdateRewardDraftAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("confirming the dialog calls the action with the new value", async () => {
    mockUpdateRewardDraftAction.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    renderEditor();

    const priceInput = screen.getByDisplayValue("500");
    await user.clear(priceInput);
    await user.type(priceInput, "750");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(mockUpdateRewardDraftAction).toHaveBeenCalledWith(expect.objectContaining({ priceVm: 750 }));
  });
});
