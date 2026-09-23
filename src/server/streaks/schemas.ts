import { z } from "zod";
// Side-effect import: registers Zod's .openapi() extension method, used
// below. Must be imported before any .openapi() call in this file runs -
// see src/lib/openapi.ts.
import "@/lib/openapi";

// docs/ARCHITECTURE.md D30: how many missed IST days per calendar month a
// learner can have auto-covered without breaking their streak. Same
// settings.manage/super_admin-only edit path as Lesson Flow's scoring
// constants - a change here affects every learner's streak immediately.
export const StreaksSettingsSchema = z.object({
  streakFreezesPerMonth: z.number().int().nonnegative(),
});
export type StreaksSettings = z.infer<typeof StreaksSettingsSchema>;

export const DEFAULT_STREAKS_SETTINGS: StreaksSettings = {
  streakFreezesPerMonth: 2,
};

export const STREAKS_SETTINGS_KEY = "streaks";

const StreakStatsSchema = z.object({
  current: z.number().int().nonnegative().openapi({ example: 4 }),
  longest: z.number().int().nonnegative().openapi({ example: 11 }),
  freezesLeft: z.number().int().nonnegative().openapi({ example: 2 }),
});

export const StreakStatsResponseSchema = z.object({
  data: z.object({
    learning: StreakStatsSchema,
    pulseCheck: StreakStatsSchema.openapi({
      description: "Always 0/0/full freezes until Phase 5's Pulse Check exists to trigger it.",
    }),
  }),
});
