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
  // docs/ARCHITECTURE.md D28: the minimum accuracy a Video/Quiz/Role Play
  // attempt needs to count as a "successful completion" for real XP/VM
  // crediting (src/server/economy - docs/ECONOMY.md decision 4). Deliberately
  // lower than bossQuizPassMarkPct - a Boss Quiz gates world progression, this
  // only gates the reward for the lesson it's on. Failing doesn't block
  // anything else - the learner can simply retry (a fresh quiz_attempts row,
  // same as Boss Quiz); the first attempt that clears it is the one that
  // credits, since idempotency is keyed on (user, lesson), never a specific
  // attempt (D26). Story/Doubt Zone have no accuracyPct at all (no graded
  // questions) and are unaffected - see Checkpoint 3's own completion rule.
  lessonPassMarkPct: z.number().nonnegative().max(100),
  // Phase 3 Checkpoint 3: Story and Doubt Zone have no graded questions
  // (D23), so they can't be gated by accuracy - instead, completing one for
  // credit requires POST /lessons/{id}/serve to have been called first (the
  // server-stamped `startedAt` anchor) AND at least this many seconds to
  // have elapsed before POST /lessons/{id}/complete succeeds. Set well below
  // docs/ECONOMY.md's LSTEP content length (Story 6min/360s, AI Chat
  // 5min/300s) - roughly half - since reading/chat speed genuinely varies
  // and this is an anti-instant-complete floor, not a reading-speed monitor.
  storyMinCompletionSeconds: z.number().int().positive(),
  doubtZoneMinCompletionSeconds: z.number().int().positive(),
  // D25 (docs/ARCHITECTURE.md): trading unlocks once the learner has passed
  // the Boss Quiz of the PUBLISHED world at this 1-based POSITION (not a
  // specific world id/name) - src/server/worlds/service.ts's
  // isTradingUnlocked. Position-based so it keeps working automatically if
  // worlds are added, removed or reordered ahead of it.
  tradingUnlockAfterWorldPosition: z.number().int().positive(),
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
  lessonPassMarkPct: 50,
  storyMinCompletionSeconds: 180,
  doubtZoneMinCompletionSeconds: 150,
  tradingUnlockAfterWorldPosition: 3,
};

export const LESSON_FLOW_SCORING_SETTINGS_KEY = "lesson_flow_scoring";

// Lesson-meta `durationSeconds` (GET /worlds/{id}/lessons, GET
// /lessons/{id}): video/story lessons always read their OWN
// content.lengthSeconds (real, authored per lesson - see
// src/server/lessons/schemas.ts), so they're deliberately not in this key.
// quiz/boss_quiz/role_play/doubt_zone have no per-lesson length field at all
// (a practice quiz's "length" is really question-count * the shared
// practiceQuizTimerSeconds, and doubt_zone is a chat with no step count) -
// this is one fixed estimate per kind instead, admin-editable like every
// other settings_kv value, not a second per-lesson authoring surface.
export const LessonDefaultDurationSchema = z.object({
  quiz: z.number().int().positive(),
  boss_quiz: z.number().int().positive(),
  role_play: z.number().int().positive(),
  doubt_zone: z.number().int().positive(),
});
export type LessonDefaultDuration = z.infer<typeof LessonDefaultDurationSchema>;

// docs/ECONOMY.md's LSTEP table (lines 30-37), converted minutes -> seconds:
// Quiz 3min, Role Play 7min, Boss Quiz 10min, AI Chat (= doubt_zone lesson
// kind) 5min. Used both by scripts/seed-settings.ts and as the in-code
// fallback (getLessonDefaultDurationSettings) if the settings_kv row is
// ever missing - identical values either way, so an unseeded environment
// behaves exactly like a seeded one.
export const DEFAULT_LESSON_DEFAULT_DURATION_SECONDS: LessonDefaultDuration = {
  quiz: 180,
  boss_quiz: 600,
  role_play: 420,
  doubt_zone: 300,
};

export const LESSON_DEFAULT_DURATION_SECONDS_KEY = "lesson_default_duration_seconds";
