import { z } from "zod";
// Side-effect import: registers Zod's .openapi() extension method, used
// below. Must be imported before any .openapi() call in this file runs -
// see src/lib/openapi.ts.
import "@/lib/openapi";
import { LocalizedTextSchema } from "@/server/shared/schemas";

// D51 (docs/ARCHITECTURE.md): every constant here is prototype-sourced
// (FEATURE_MAP NW-25/NW-26) except dailyVmCap, which is the founder's own
// deliberately-conservative addition after reviewing the farming math - see
// D51 for the full reasoning. No fever-mode multiplier (unlike
// lesson_flow_scoring) - nothing in NW-25/26 describes one for Pulse Check.
export const PulseCheckScoringSchema = z.object({
  speedBonusThresholdPct: z.number().int().min(1).max(100),
  speedBonusVm: z.number().int().min(0).max(200),
  comboBonusPerStep: z.number().int().min(0).max(50),
  comboBonusCap: z.number().int().min(1).max(20),
  allCorrectBonusVm: z.number().int().min(0).max(1000),
  dailyVmCap: z.number().int().min(0).max(5000),
});
export type PulseCheckScoring = z.infer<typeof PulseCheckScoringSchema>;

export const DEFAULT_PULSE_CHECK_SCORING: PulseCheckScoring = {
  speedBonusThresholdPct: 45,
  speedBonusVm: 15,
  comboBonusPerStep: 5,
  comboBonusCap: 5,
  allCorrectBonusVm: 100,
  dailyVmCap: 200,
};
export const PULSE_CHECK_SCORING_SETTINGS_KEY = "pulse_check_scoring";

// --- App-facing (learner) ---

export const PulseCheckAttemptParamsSchema = z.object({ attemptId: z.uuid() });
export const PulseCheckStepParamsSchema = z.object({
  attemptId: z.uuid(),
  n: z.coerce.number().int().positive(),
});

export const PulseCheckCurrentResponseSchema = z.object({
  editionId: z.uuid().nullable().openapi({ description: "null if today's edition hasn't been built yet" }),
  date: z.string().openapi({ example: "2026-09-28", description: "IST calendar date, YYYY-MM-DD" }),
  questionCount: z.number().int(),
  perQuestionTimerSeconds: z.number().int(),
  baseVmPerQuestion: z.number().int(),
  maxVmPayout: z.number().int().openapi({ description: "Best-case total: every question correct and fast, plus the all-correct bonus, before today's daily cap" }),
  alreadyCompletedToday: z.boolean(),
  inProgressAttemptId: z.uuid().nullable(),
}).openapi("PulseCheckCurrent");

export const PulseCheckStartResponseSchema = z.object({
  attemptId: z.uuid(),
  editionId: z.uuid(),
  totalSteps: z.number().int(),
  resumed: z.boolean().openapi({ description: "true if this returned an already-in-progress attempt rather than creating a new one" }),
});

const PulseCheckQuestionSchema = z.object({
  questionId: z.uuid(),
  format: z.string(),
  topic: LocalizedTextSchema.nullable(),
  sourceHeadline: LocalizedTextSchema.nullable().openapi({ description: "NW-13: this question's source story headline" }),
  prompt: LocalizedTextSchema,
  payload: z.record(z.string(), z.unknown()),
  timerSeconds: z.number().int(),
});

export const PulseCheckServeResponseSchema = z.object({
  stepIndex: z.number().int(),
  totalSteps: z.number().int(),
  question: PulseCheckQuestionSchema,
});

export const PulseCheckSubmitAnswerRequestSchema = z.object({
  answer: z.unknown().describe("Shape depends on the question's format - same per-format answer shapes as lesson questions"),
});

export const PulseCheckAnswerResponseSchema = z.object({
  isCorrect: z.boolean(),
  timedOut: z.boolean(),
  speedBonusAwarded: z.boolean(),
  comboAfter: z.number().int(),
  vmAwarded: z.number().int().openapi({ description: "This question's own score (base+speed+combo), whole VM, before the multiplier/daily cap are applied at finish" }),
  correctAnswer: z.unknown(),
  explanation: LocalizedTextSchema,
});

export const PulseCheckFinishResponseSchema = z.object({
  accuracyPct: z.number().int(),
  bestCombo: z.number().int(),
  allCorrectBonusAwarded: z.boolean(),
  rawVmEarnedPaise: z.number().int(),
  totalVmAwardedPaise: z.number().int(),
  dailyCapReached: z.boolean(),
});

export const PulseCheckResultResponseSchema = z.object({
  attemptId: z.uuid(),
  accuracyPct: z.number().int(),
  bestCombo: z.number().int(),
  allCorrectBonusAwarded: z.boolean(),
  rawVmEarnedPaise: z.number().int(),
  totalVmAwardedPaise: z.number().int(),
  dailyCapReached: z.boolean(),
  answers: z.array(
    z.object({
      stepIndex: z.number().int(),
      isCorrect: z.boolean().nullable(),
      timedOut: z.boolean().nullable(),
      speedBonusAwarded: z.boolean().nullable(),
      vmAwarded: z.number().int().nullable(),
    }),
  ),
});
