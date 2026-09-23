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
  }),
});
