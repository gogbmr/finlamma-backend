// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecentClaims } from "./recent-claims";

const mockRefundRewardClaimAction = vi.fn();
vi.mock("./actions", () => ({
  refundRewardClaimAction: (input: unknown) => mockRefundRewardClaimAction(input),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CLAIM = {
  id: "claim-1",
  userId: "user-1",
  rewardId: "reward-1",
  rewardName: "Dark theme",
  pricePaid: 500,
  claimedAt: "2026-01-01T00:00:00.000Z",
};

describe("RecentClaims - Task 7 refund confirm", () => {
  it("Cancel on the confirm dialog sends nothing - the refund action is never called", async () => {
    const user = userEvent.setup();
    render(<RecentClaims claims={[CLAIM]} />);

    await user.type(screen.getByPlaceholderText("Required"), "Wrong reward claimed");
    await user.click(screen.getByRole("button", { name: "Refund" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/₹500 V Money/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Wrong reward claimed/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(mockRefundRewardClaimAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("confirming the dialog calls the refund action with the claim id and reason", async () => {
    mockRefundRewardClaimAction.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<RecentClaims claims={[CLAIM]} />);

    await user.type(screen.getByPlaceholderText("Required"), "Wrong reward claimed");
    await user.click(screen.getByRole("button", { name: "Refund" }));

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Refund" }));

    expect(mockRefundRewardClaimAction).toHaveBeenCalledWith({
      claimId: "claim-1",
      reason: "Wrong reward claimed",
    });
  });

  it("refuses to open the confirm dialog without a reason typed first", async () => {
    const user = userEvent.setup();
    render(<RecentClaims claims={[CLAIM]} />);

    await user.click(screen.getByRole("button", { name: "Refund" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mockRefundRewardClaimAction).not.toHaveBeenCalled();
  });
});
