import type { NewsQualityGradeSchema } from "./schemas";
import type { z } from "zod";

type QualityGrade = z.infer<typeof NewsQualityGradeSchema>;

// Deterministic heuristic (docs/DATA_MODEL.md: "quality_grade A|B|C
// (auto-heuristic, staff-overridable)") - never an LLM's own judgment about
// the quality of its own output, same "don't let a model grade itself"
// reasoning as src/server/trading/advice-language.ts staying a plain
// keyword scan rather than an AI call. Staff can always override via
// qualityGradeOverride (src/server/news/schemas.ts) - this is a starting
// point for the pipeline table, not a hard gate on anything.
export function computeQualityGrade(input: {
  bodyParagraphCount: number;
  summaryWordCount: number;
  hasJargon: boolean;
  adviceLikeWarningCount: number;
}): QualityGrade {
  // Any advice-like phrase hit caps the grade at C regardless of everything
  // else - a well-written story that reads like investment advice is a
  // content problem, not a quality-of-writing one, and should visually
  // stand out in the pipeline table for review.
  if (input.adviceLikeWarningCount > 0) return "C";
  if (input.bodyParagraphCount >= 2 && input.hasJargon && input.summaryWordCount >= 15) return "A";
  if (input.bodyParagraphCount >= 1 && input.summaryWordCount >= 8) return "B";
  return "C";
}
