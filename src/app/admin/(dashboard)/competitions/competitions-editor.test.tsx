// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompetitionsEditor } from "./competitions-editor";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/competitions",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const mockUpdateCompetitionDraftAction = vi.fn();
vi.mock("./actions", () => ({
  createCompetitionDraftAction: vi.fn(),
  publishCompetitionAction: vi.fn(),
  updateCompetitionDraftAction: (id: string, input: unknown) => mockUpdateCompetitionDraftAction(id, input),
  updateCompetitionSettingsAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const COMPETITION = {
  id: "comp-1",
  name: { en: "October Trading Cup", hi: "x", hx: "x" },
  instrumentId: "instrument-1",
  virtualCapitalPaise: 10_000_000, // ₹1,00,000
  windowStart: "2026-10-01T00:00:00.000Z",
  windowEnd: "2026-10-31T00:00:00.000Z",
  prizes: [
    { rankFrom: 1, rankTo: 1, vmAmount: 5000, badgeId: null },
    { rankFrom: 2, rankTo: 3, vmAmount: 2000, badgeId: null },
    { rankFrom: 4, rankTo: 10, vmAmount: 500, badgeId: null },
  ],
  rules: { en: "Trade responsibly", hi: "x", hx: "x" },
  status: "draft" as const,
};

const SETTINGS = { minQualifyingTrades: 5, maxTrades: 10, entryWindowPct: 50 };

function renderEditor() {
  return render(
    <CompetitionsEditor
      competitions={[COMPETITION]}
      total={1}
      page={1}
      pageCount={1}
      pageSize={20}
      q=""
      sort={null}
      dir="asc"
      status={null}
      instruments={[{ id: "instrument-1", symbol: "RELIANCE", name: "Reliance Industries" }]}
      badges={[]}
      settings={SETTINGS}
    />,
  );
}

describe("CompetitionsEditor - Task 7 confirm-before-save", () => {
  it("Cancel on the confirm dialog sends nothing - the action is never called", async () => {
    const user = userEvent.setup();
    renderEditor();

    const capitalInput = screen.getByDisplayValue("100000");
    await user.clear(capitalInput);
    await user.type(capitalInput, "150000");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const dialog = await screen.findByRole("alertdialog");
    // virtualCapitalPaise is explicitly NOT V Money (D57) - must show as
    // plain rupees, never "V Money".
    expect(within(dialog).getByText(/Virtual capital/)).toBeInTheDocument();
    expect(within(dialog).getByText(/₹1,50,000/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/₹1,50,000 V Money/)).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(mockUpdateCompetitionDraftAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("confirming the dialog calls the action with the converted paise value", async () => {
    mockUpdateCompetitionDraftAction.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    renderEditor();

    const capitalInput = screen.getByDisplayValue("100000");
    await user.clear(capitalInput);
    await user.type(capitalInput, "150000");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(mockUpdateCompetitionDraftAction).toHaveBeenCalledWith(
      "comp-1",
      expect.objectContaining({ virtualCapitalPaise: 15_000_000 }),
    );
  });

  it("shows a real V Money prize change labelled 'V Money', distinct from the plain-rupee capital line", async () => {
    const user = userEvent.setup();
    renderEditor();

    const firstPrizeInput = screen.getByDisplayValue("5000");
    await user.clear(firstPrizeInput);
    await user.type(firstPrizeInput, "6000");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/1st prize/)).toBeInTheDocument();
    expect(within(dialog).getByText(/₹6,000 V Money/)).toBeInTheDocument();
  });
});
