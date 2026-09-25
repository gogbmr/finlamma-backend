import { logActivity } from "@/lib/activity-log";
import type { requestMeta } from "@/lib/http";
import { getSettingJson, setSettingJson } from "@/lib/settings";
import { DAILY_GOAL_EVALUATORS } from "./evaluators";
import { DAILY_GOALS_SETTINGS_KEY, DailyGoalsSettingsSchema, DEFAULT_DAILY_GOALS, type DailyGoalsSettings } from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;

// Same "fall back to the default rather than hard-fail" reasoning as
// getLessonFlowScoringSettings - a settings_kv shape drift must never break
// every learner's daily goal meter.
export async function getDailyGoalsSettings(): Promise<DailyGoalsSettings> {
  const raw = await getSettingJson(DAILY_GOALS_SETTINGS_KEY);
  if (raw === null) return DEFAULT_DAILY_GOALS;
  const parsed = DailyGoalsSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_DAILY_GOALS;
}

export async function updateDailyGoalsSettings(
  actor: { id: string },
  input: DailyGoalsSettings,
  meta: RequestMeta,
): Promise<DailyGoalsSettings> {
  const previous = await getDailyGoalsSettings();
  await setSettingJson(
    DAILY_GOALS_SETTINGS_KEY,
    input,
    "Daily goal meter: which goal types are active and their targets. Evaluators live in code " +
      "(src/server/daily-goals/evaluators.ts) - this only controls which of them run and what " +
      "counts as \"done\".",
  );

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "settings.daily_goals_updated",
    targetType: "settings_kv",
    targetId: DAILY_GOALS_SETTINGS_KEY,
    metadata: { previous, next: input },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return input;
}

// PR-09: only the ACTIVE goals are returned, each with today's real
// progress - the app renders however many come back (2 today, 3 once Phase
// 5 flips pulse_check on) rather than assuming a fixed count. Never awards
// XP/VM (checked against the prototype/docs/ECONOMY.md - no such reward
// exists) - this is a pure progress display over rewards the underlying
// activity already paid.
export async function getMyDailyGoals(userId: string, at: Date = new Date()) {
  const settings = await getDailyGoalsSettings();
  const active = settings.filter((g) => g.active);
  return Promise.all(
    active.map(async (goal) => {
      const current = await DAILY_GOAL_EVALUATORS[goal.type](userId, at);
      return {
        type: goal.type,
        target: goal.target,
        current,
        completed: current >= goal.target,
      };
    }),
  );
}
