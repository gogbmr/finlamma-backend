// The same letter-grade thresholds app-wide (docs/FEATURE_MAP.md's Profile
// gap #4: "reuse the Lesson Flow engine's exact grade thresholds app-wide"),
// for both the (not yet built) per-lesson Report Card (LF-24) and the
// weekly Profile report card (PR-31, src/server/report-card). One shared
// function so the two can never drift to different cutoffs.
export type LetterGrade = "S" | "A" | "B" | "C";

export function letterGradeForAccuracy(accuracyPct: number): LetterGrade {
  if (accuracyPct >= 95) return "S";
  if (accuracyPct >= 83) return "A";
  if (accuracyPct >= 67) return "B";
  return "C";
}
