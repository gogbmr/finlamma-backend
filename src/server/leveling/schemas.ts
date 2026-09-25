import { z } from "zod";
// Side-effect import: registers Zod's .openapi() extension method, used
// below. Must be imported before any .openapi() call in this file runs -
// see src/lib/openapi.ts.
import "@/lib/openapi";
import { LocalizedTextSchema } from "@/server/shared/schemas";

// Rising XP curve: XP required to go from level L to L+1 = baseXp +
// stepXp*(L-1) (src/server/leveling/math.ts). Level itself is never stored
// (CLAUDE.md/docs/ARCHITECTURE.md) - only these two constants are, so
// changing them re-derives every learner's level on their next read with
// no backfill needed. Same settings.manage/super_admin-only edit path as
// every other learner-wide constant (Lesson Flow scoring, streak freezes).
export const LevelCurveSettingsSchema = z.object({
  baseXp: z.number().int().positive(),
  stepXp: z.number().int().nonnegative(),
});
export type LevelCurveSettings = z.infer<typeof LevelCurveSettingsSchema>;

export const DEFAULT_LEVEL_CURVE_SETTINGS: LevelCurveSettings = {
  baseXp: 300,
  stepXp: 100,
};

export const LEVEL_CURVE_SETTINGS_KEY = "level_curve";

const LevelInfoSchema = z.object({
  level: z.number().int().positive().openapi({ example: 3 }),
  totalXp: z.number().int().nonnegative().openapi({ example: 1000 }),
  xpIntoLevel: z.number().int().nonnegative().openapi({ example: 300 }),
  xpToNextLevel: z.number().int().nonnegative().openapi({ example: 200 }),
});

export const XpStatsResponseSchema = z.object({
  data: LevelInfoSchema.extend({
    weeklyXp: z.number().int().nonnegative().openapi({
      description: "XP earned in the trailing 7 days.",
      example: 180,
    }),
  }),
});

const RankTitleRefSchema = LocalizedTextSchema.nullable().openapi({
  description:
    "The highest rank title the learner's current level qualifies for, or null if no " +
    "rank_titles row has a minLevel at or below their level yet.",
});

// PR-05: the learning-scope streak only (docs/ARCHITECTURE.md's `streaks`
// table also tracks a separate `pulse_check` scope, not relevant to this
// screen - see GET /me/stats/streak for both).
const StreakSummarySchema = z.object({
  current: z.number().int().nonnegative().openapi({ example: 4 }),
  longest: z.number().int().nonnegative().openapi({ example: 12 }),
  freezesLeft: z.number().int().nonnegative().openapi({ example: 2 }),
});

// PR-06: total is every currently-published lesson across every world, not
// scoped to worlds the learner has reached yet - matches the prototype's
// "lectures completed / total" framing.
const LessonsProgressSchema = z.object({
  completed: z.number().int().nonnegative().openapi({ example: 18 }),
  total: z.number().int().nonnegative().openapi({ example: 40 }),
  pct: z.number().int().min(0).max(100).openapi({ example: 45 }),
});

// PR-08: oldest-first, always exactly 7 entries (today included).
const ActivityDotSchema = z.object({
  date: z.string().openapi({ example: "2026-09-17", description: "IST calendar date." }),
  active: z.boolean().openapi({ example: true }),
});

export const ProfileOverviewResponseSchema = z.object({
  data: z.object({
    firstName: z.string().nullable().openapi({ example: "Aarav" }),
    lastInitial: z.string().nullable().openapi({ example: "S" }),
    joinedAt: z.string().datetime().openapi({ example: "2026-01-05T09:12:00.000Z" }),
    level: z.number().int().positive().openapi({ example: 3 }),
    totalXp: z.number().int().nonnegative().openapi({ example: 1000 }),
    xpIntoLevel: z.number().int().nonnegative().openapi({ example: 300 }),
    xpToNextLevel: z.number().int().nonnegative().openapi({ example: 200 }),
    rankTitle: RankTitleRefSchema,
    streak: StreakSummarySchema,
    lessons: LessonsProgressSchema,
    quizAccuracyPct: z.number().int().min(0).max(100).nullable().openapi({
      example: 82,
      description: "Null until the learner has answered at least one graded question.",
    }),
    activityDotCalendar: z.array(ActivityDotSchema).length(7),
  }),
});
