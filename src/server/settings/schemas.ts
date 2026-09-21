import { z } from "zod";

// Lesson Flow's scoring constants (docs/PRODUCT_SPEC.md §1, FEATURE_MAP
// LF-12/LF-22/LF-03): admin-editable via settings_kv key
// "lesson_flow_scoring", never hardcoded in the scoring function itself
// (src/server/quiz-attempts/scoring.ts). Two base-XP pairs - video's
// in-video "pop quiz" (LF-12) pays less for a wrong answer than a lesson's
// own practice quiz (LF-22) - everything else (speed bonus, combo, fever)
// is shared between them.
export const LessonFlowScoringSchema = z.object({
  popQuiz: z.object({
    correctXp: z.number().int().nonnegative(),
    wrongXp: z.number().int().nonnegative(),
  }),
  practiceQuiz: z.object({
    correctXp: z.number().int().nonnegative(),
    wrongXp: z.number().int().nonnegative(),
  }),
  // A video's in-video pop quiz has its own per-cue timerSeconds
  // (src/server/lessons/schemas.ts's VideoCueSchema), but a quiz/boss_quiz/
  // role_play's QuizLikeContentSchema has no per-question timer field
  // (FEATURE_MAP LF-11 says 6-16s "depending on question" for the pop-quiz
  // case specifically) - practice-quiz steps all share this one
  // admin-editable timer instead of a per-question value.
  practiceQuizTimerSeconds: z.number().int().positive(),
  // Answer within this % of the allotted time to earn the speed bonus.
  speedBonusThresholdPct: z.number().positive().max(100),
  speedBonusXp: z.number().int().nonnegative(),
  comboBonusPerStep: z.number().int().nonnegative(),
  comboBonusCap: z.number().int().positive(),
  feverComboThreshold: z.number().int().positive(),
  feverMultiplier: z.number().positive(),
  // D24 (docs/ARCHITECTURE.md): the minimum accuracy (correct answers /
  // total steps) a Boss Quiz attempt needs to count as a PASS - only a
  // passing attempt clears the world's sequential-unlock gate
  // (src/server/worlds/service.ts). Failing doesn't block anything else -
  // the learner can simply retry (a fresh quiz_attempts row).
  bossQuizPassMarkPct: z.number().nonnegative().max(100),
});
export type LessonFlowScoring = z.infer<typeof LessonFlowScoringSchema>;

// Seeded starting values - the prototype's exact numbers per the Phase 2b
// kickoff/FEATURE_MAP decisions log ("DECIDED: keep the prototype's exact
// speed/combo/all-correct bonus constants as the real rule"). Used both by
// scripts/seed-settings.ts and as the in-code fallback
// (getLessonFlowScoringSettings) if the settings_kv row is ever missing.
export const DEFAULT_LESSON_FLOW_SCORING: LessonFlowScoring = {
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
};

export const LESSON_FLOW_SCORING_SETTINGS_KEY = "lesson_flow_scoring";
