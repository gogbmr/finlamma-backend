import { answerMatches, LATENCY_ALLOWANCE_MS } from "@/server/quiz-attempts/scoring";
import type { QuestionFormat } from "@/server/questions/schemas";
import type { PulseCheckScoring } from "./schemas";

// D51 (docs/ARCHITECTURE.md): base + speed bonus + combo bonus, no fever
// mode (nothing in FEATURE_MAP NW-25/26 describes one for Pulse Check,
// unlike lesson_flow_scoring). Reuses answerMatches from lesson-flow's
// scoring module directly - per-format structural answer comparison has
// nothing lesson-specific about it, so duplicating it here would just be
// two copies of the same per-format switch statement drifting apart.
// Whole VM, not paise - converted to paise once, at the attempt level, in
// src/server/pulse-check/service.ts's finishAttempt (same "compute in
// whole VM, convert once at the ledger boundary" pattern
// creditLessonCompletion already uses).
export interface PulseCheckAnswerScoreInput {
  format: QuestionFormat;
  submittedAnswer: unknown;
  correctAnswer: unknown;
  elapsedMs: number;
  timerSeconds: number;
  comboBefore: number;
  settings: PulseCheckScoring;
  baseVm: number;
}

export interface PulseCheckAnswerScoreResult {
  isCorrect: boolean;
  timedOut: boolean;
  speedBonusAwarded: boolean;
  comboAfter: number;
  vmAwarded: number;
}

export function computePulseCheckAnswerScore(input: PulseCheckAnswerScoreInput): PulseCheckAnswerScoreResult {
  const effectiveElapsedMs = Math.max(0, input.elapsedMs - LATENCY_ALLOWANCE_MS);
  const timedOut = effectiveElapsedMs > input.timerSeconds * 1000;
  const matches = answerMatches(input.format, input.submittedAnswer, input.correctAnswer);
  const isCorrect = matches && !timedOut;

  if (!isCorrect) {
    return { isCorrect: false, timedOut, speedBonusAwarded: false, comboAfter: 0, vmAwarded: 0 };
  }

  const speedBonusAwarded =
    effectiveElapsedMs <= (input.timerSeconds * 1000 * input.settings.speedBonusThresholdPct) / 100;
  const comboAfter = input.comboBefore + 1;
  const comboBonus = input.settings.comboBonusPerStep * Math.min(comboAfter, input.settings.comboBonusCap);
  const vmAwarded = input.baseVm + (speedBonusAwarded ? input.settings.speedBonusVm : 0) + comboBonus;

  return { isCorrect: true, timedOut: false, speedBonusAwarded, comboAfter, vmAwarded };
}
