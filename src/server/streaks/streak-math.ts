// Pure decision logic shared between the WRITE path (recordStreakActivity in
// repo.ts, which only runs when a real activity happens) and the READ path
// (getStreakStats in service.ts, which must report the CURRENT truth even
// though there is no midnight job to advance the stored row when nobody is
// active). Keeping this in one place means both paths agree on exactly when
// a freeze covers a gap and when it doesn't - see docs/ARCHITECTURE.md D30.

export type StreakTransition =
  | { kind: "same_day" }
  | { kind: "extend"; consumesFreeze: boolean }
  | { kind: "reset" };

// gapDays = daysBetweenIstDates(lastActiveDateIst, asOfIst). A freeze only
// ever covers a SINGLE missed day (gapDays === 2), never a bigger gap, and
// never more than one freeze at a time - this is what stops freezes from
// being "retroactively stacked" to rescue a long absence.
export function computeStreakTransition(gapDays: number, freezesAvailable: number): StreakTransition {
  if (gapDays <= 0) return { kind: "same_day" };
  if (gapDays === 1) return { kind: "extend", consumesFreeze: false };
  if (gapDays === 2 && freezesAvailable >= 1) return { kind: "extend", consumesFreeze: true };
  return { kind: "reset" };
}

// Lazy monthly reset, factored out so the write path and the read path
// compute the same "effective" allowance for a given as-of date without
// either of them needing to write anything.
export function effectiveFreezesLeft(
  storedFreezesLeft: number,
  storedResetMonth: string,
  asOfIst: string,
  freezesPerMonth: number,
): number {
  const asOfMonth = asOfIst.slice(0, 7);
  return storedResetMonth === asOfMonth ? storedFreezesLeft : freezesPerMonth;
}
