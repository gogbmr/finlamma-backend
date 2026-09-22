import type { LessonFlowScoring } from "@/server/settings/schemas";
import type {
  FillBlankAnswer,
  MatchPairsAnswer,
  OrderingAnswer,
  QuestionFormat,
  SingleSelectAnswer,
  SortBucketsAnswer,
  SpotMistakeAnswer,
} from "@/server/questions/schemas";

// Grace period subtracted from the server-measured elapsed time before it's
// compared against either the timeout or the speed-bonus threshold - covers
// the network round-trip between serveStep stamping `servedAt` and the
// submit request actually landing at the server, so a learner who genuinely
// answered in time isn't timed out (or denied the speed bonus) purely
// because of network latency on the way back. Deliberately small: this is
// slack for transport time, not an invitation to answer slower than the
// timer allows. docs/ARCHITECTURE.md D21.
export const LATENCY_ALLOWANCE_MS = 300;

// Structural equality between a learner's submitted answer and
// `questions.answer`, per format - both are assumed already validated by
// answerSchemaForFormat (src/server/questions/schemas.ts) before this is
// called, so this only ever compares two values of the same known shape.
// Arrays are compared by JSON serialization, safe here because every
// format's answer array holds only numbers in a fixed order (no object-key
// ordering ambiguity).
export function answerMatches(format: QuestionFormat, submitted: unknown, correct: unknown): boolean {
  switch (format) {
    case "single_select":
      return (submitted as SingleSelectAnswer).correctIndex === (correct as SingleSelectAnswer).correctIndex;
    case "ordering":
      return (
        JSON.stringify((submitted as OrderingAnswer).correctOrder) ===
        JSON.stringify((correct as OrderingAnswer).correctOrder)
      );
    case "sort_buckets":
      return (
        JSON.stringify((submitted as SortBucketsAnswer).bucketByItemIndex) ===
        JSON.stringify((correct as SortBucketsAnswer).bucketByItemIndex)
      );
    case "fill_blank":
      return (
        JSON.stringify((submitted as FillBlankAnswer).correctFillIndices) ===
        JSON.stringify((correct as FillBlankAnswer).correctFillIndices)
      );
    case "match_pairs":
      return (
        JSON.stringify((submitted as MatchPairsAnswer).rightIndexByLeftIndex) ===
        JSON.stringify((correct as MatchPairsAnswer).rightIndexByLeftIndex)
      );
    case "spot_mistake":
      return (submitted as SpotMistakeAnswer).wrongLineIndex === (correct as SpotMistakeAnswer).wrongLineIndex;
  }
}

export type QuizKind = "popQuiz" | "practiceQuiz";

export interface ScoreInput {
  quizKind: QuizKind;
  answerMatches: boolean;
  elapsedMs: number; // server-measured: answeredAt (now) minus servedAt
  timerSeconds: number;
  comboBefore: number;
  settings: LessonFlowScoring;
}

export interface ScoreResult {
  isCorrect: boolean;
  timedOut: boolean;
  speedBonusAwarded: boolean;
  feverActive: boolean;
  comboAfter: number;
  xpAwardedPreview: number;
}

// Server-side scoring (FEATURE_MAP LF-03/LF-11/LF-12/LF-22, PRODUCT_SPEC.md
// §1): base XP for correct/wrong (different per quizKind) + speed bonus
// (answered within speedBonusThresholdPct of the timer) + combo bonus
// (comboBonusPerStep x min(comboAfter, comboBonusCap)) + fever mode (2x on
// base+speed once comboAfter reaches feverComboThreshold) "on top of that" -
// fever multiplies base+speed only, combo bonus is added after, unmultiplied
// (PRODUCT_SPEC.md §1's ordering). A timeout (elapsed, net of the latency
// allowance, exceeds the allotted timerSeconds) always grades as wrong
// regardless of what was submitted - FEATURE_MAP LF-11. Wrong resets combo
// to 0. Pure function - no DB/clock access - so every rule here is testable
// without mocking time or a database.
export function computeScore(input: ScoreInput): ScoreResult {
  const effectiveElapsedMs = Math.max(0, input.elapsedMs - LATENCY_ALLOWANCE_MS);
  const timedOut = effectiveElapsedMs > input.timerSeconds * 1000;
  const isCorrect = input.answerMatches && !timedOut;
  const kindConfig = input.settings[input.quizKind];

  if (!isCorrect) {
    return {
      isCorrect: false,
      timedOut,
      speedBonusAwarded: false,
      feverActive: false,
      comboAfter: 0,
      xpAwardedPreview: kindConfig.wrongXp,
    };
  }

  const speedBonusAwarded =
    effectiveElapsedMs <= (input.timerSeconds * 1000 * input.settings.speedBonusThresholdPct) / 100;
  const comboAfter = input.comboBefore + 1;
  const feverActive = comboAfter >= input.settings.feverComboThreshold;
  const comboBonus =
    input.settings.comboBonusPerStep * Math.min(comboAfter, input.settings.comboBonusCap);
  const base = kindConfig.correctXp;
  const speedBonus = speedBonusAwarded ? input.settings.speedBonusXp : 0;
  const preFever = base + speedBonus;
  const xpAwardedPreview = Math.round(
    (feverActive ? preFever * input.settings.feverMultiplier : preFever) + comboBonus,
  );

  return { isCorrect: true, timedOut: false, speedBonusAwarded, feverActive, comboAfter, xpAwardedPreview };
}
