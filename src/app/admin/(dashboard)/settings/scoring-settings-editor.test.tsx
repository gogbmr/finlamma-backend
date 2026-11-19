// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScoringSettingsEditor } from "./scoring-settings-editor";

const mockUpdateLessonFlowScoringAction = vi.fn();
vi.mock("./actions", () => ({
  updateLessonFlowScoringAction: (input: unknown) => mockUpdateLessonFlowScoringAction(input),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const SCORING = {
  popQuiz: { correctXp: 20, wrongXp: 4 },
  practiceQuiz: { correctXp: 20, wrongXp: 5 },
  practiceQuizTimerSeconds: 15,
  speedBonusThresholdPct: 45,
  speedBonusXp: 10,
  comboBonusPerStep: 3,
  comboBonusCap: 5,
  feverComboThreshold: 3,
  feverMultiplier: 2,
  bossQuizPassMarkPct: 60,
  lessonPassMarkPct: 50,
  storyMinCompletionSeconds: 180,
  doubtZoneMinCompletionSeconds: 150,
  tradingUnlockAfterWorldPosition: 3,
};

// ScoringSettingsEditor's NumberField renders <Label> as a plain sibling of
// <Input>, with no htmlFor/id - so getByLabelText can't find these inputs.
// Locate the input via its own label text's parent instead.
function numberInputFor(labelText: string): HTMLInputElement {
  const label = screen.getByText(labelText);
  const input = label.parentElement?.querySelector("input");
  if (!input) throw new Error(`No input found next to label "${labelText}"`);
  return input;
}

describe("ScoringSettingsEditor - Task 7 confirm-before-save", () => {
  it("Cancel on the confirm dialog sends nothing - the action is never called", async () => {
    const user = userEvent.setup();
    render(<ScoringSettingsEditor scoring={SCORING} />);

    const bossQuizInput = numberInputFor("Boss Quiz pass mark (%)");
    await user.clear(bossQuizInput);
    await user.type(bossQuizInput, "75");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Save Lesson Flow scoring settings?")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(mockUpdateLessonFlowScoringAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("confirming the dialog calls the action with the new value", async () => {
    mockUpdateLessonFlowScoringAction.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<ScoringSettingsEditor scoring={SCORING} />);

    const bossQuizInput = numberInputFor("Boss Quiz pass mark (%)");
    await user.clear(bossQuizInput);
    await user.type(bossQuizInput, "75");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(mockUpdateLessonFlowScoringAction).toHaveBeenCalledWith(
      expect.objectContaining({ bossQuizPassMarkPct: 75 }),
    );
  });
});
