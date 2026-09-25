import { z } from "zod";
import { registry } from "@/lib/openapi";

// Fixed, code-defined set of goal TYPES an evaluator exists for
// (src/server/daily-goals/evaluators.ts) - staff can turn any of these on/
// off and set its target via settings_kv, but can't invent a new type from
// the admin UI (that needs a new evaluator, a code change). "pulse_check"
// exists here now, inactive by default, so Phase 5 can simply flip it on
// with no schema change once real Pulse Check data exists.
export const DailyGoalTypeEnum = z.enum(["study_minutes", "lesson_completed", "pulse_check"]);
export type DailyGoalType = z.infer<typeof DailyGoalTypeEnum>;

export const DailyGoalConfigSchema = z.object({
  type: DailyGoalTypeEnum,
  target: z.number().int().positive(),
  active: z.boolean(),
});
export type DailyGoalConfig = z.infer<typeof DailyGoalConfigSchema>;

export const DailyGoalsSettingsSchema = z
  .array(DailyGoalConfigSchema)
  .refine((goals) => new Set(goals.map((g) => g.type)).size === goals.length, {
    message: "Each goal type may only appear once",
  });
export type DailyGoalsSettings = z.infer<typeof DailyGoalsSettingsSchema>;

// The daily goal meter never awards XP or V Money by itself (checked against
// the prototype and docs/ECONOMY.md - no such reward exists anywhere) - it's
// a pure progress display over rewards the underlying lesson completions
// already paid. "study_minutes" needs session_time_daily (World Home gap #5)
// and "lesson_completed" needs lesson_progress, both already built;
// "pulse_check" ships inactive until Phase 5.
export const DEFAULT_DAILY_GOALS: DailyGoalsSettings = [
  { type: "study_minutes", target: 20, active: true },
  { type: "lesson_completed", target: 1, active: true },
  { type: "pulse_check", target: 1, active: false },
];

export const DAILY_GOALS_SETTINGS_KEY = "daily_goals";

const DailyGoalProgressSchema = z.object({
  type: DailyGoalTypeEnum.openapi({ example: "study_minutes" }),
  target: z.number().int().positive().openapi({ example: 20 }),
  current: z.number().int().nonnegative().openapi({ example: 12 }),
  completed: z.boolean().openapi({ example: false }),
});

export const DailyGoalsResponseSchema = registry.register(
  "DailyGoalsResponse",
  z.object({
    data: z.array(DailyGoalProgressSchema).openapi({
      description:
        "Only the goal types staff have turned on right now - renders however many come back, " +
        "never assumes a fixed count.",
    }),
  }),
);
