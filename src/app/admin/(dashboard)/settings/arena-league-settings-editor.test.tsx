// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArenaLeagueSettingsEditor } from "./arena-league-settings-editor";

const mockUpdateArenaLeagueSettingsAction = vi.fn();
vi.mock("./actions", () => ({
  updateArenaLeagueSettingsAction: (input: unknown) => mockUpdateArenaLeagueSettingsAction(input),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const SETTINGS = {
  promoteVmReward: 500,
  safeVmReward: 0,
  weeklyVmCap: 2000,
  cheerWeeklySenderReceiverCap: 100,
  crestBadgeId: null,
};

describe("ArenaLeagueSettingsEditor - Task 7 confirm-before-save", () => {
  it("Cancel on the confirm dialog sends nothing - the action is never called", async () => {
    const user = userEvent.setup();
    render(<ArenaLeagueSettingsEditor settings={SETTINGS} externalBadges={[]} />);

    await user.clear(screen.getByLabelText("Promote-zone reward (VM)"));
    await user.type(screen.getByLabelText("Promote-zone reward (VM)"), "900");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Save Arena league settings?")).toBeInTheDocument();
    expect(within(dialog).getByText(/500.*→.*900|900/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(mockUpdateArenaLeagueSettingsAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("confirming the dialog calls the action with the new value", async () => {
    mockUpdateArenaLeagueSettingsAction.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<ArenaLeagueSettingsEditor settings={SETTINGS} externalBadges={[]} />);

    await user.clear(screen.getByLabelText("Promote-zone reward (VM)"));
    await user.type(screen.getByLabelText("Promote-zone reward (VM)"), "900");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(mockUpdateArenaLeagueSettingsAction).toHaveBeenCalledWith(
      expect.objectContaining({ promoteVmReward: 900 }),
    );
  });
});
