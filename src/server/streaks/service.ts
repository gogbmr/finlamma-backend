import { captureEvent } from "@/lib/analytics";
import { logActivity } from "@/lib/activity-log";
import type { requestMeta } from "@/lib/http";
import { daysBetweenIstDates, istDateString } from "@/lib/ist-date";
import { getSettingJson, setSettingJson } from "@/lib/settings";
import { NOTIFICATION_COPY } from "@/server/notifications/copy";
import { notifyUser } from "@/server/notifications/service";
import { getStreak, listAtRiskLearningStreaks, recordStreakActivity, type StreakScope } from "./repo";
import {
  DEFAULT_STREAKS_SETTINGS,
  STREAKS_SETTINGS_KEY,
  StreaksSettingsSchema,
  type StreaksSettings,
} from "./schemas";
import { computeStreakTransition, effectiveFreezesLeft } from "./streak-math";

type RequestMeta = ReturnType<typeof requestMeta>;

export async function getStreaksSettings(): Promise<StreaksSettings> {
  const raw = await getSettingJson(STREAKS_SETTINGS_KEY);
  if (raw === null) return DEFAULT_STREAKS_SETTINGS;
  const parsed = StreaksSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_STREAKS_SETTINGS;
}

// Gated on settings.manage (super_admin only) - same narrow trust bar as
// Lesson Flow's scoring constants, for the same reason: changes what every
// learner's streak does immediately.
export async function updateStreaksSettings(
  actor: { id: string },
  input: StreaksSettings,
  meta: RequestMeta,
): Promise<StreaksSettings> {
  const previous = await getStreaksSettings();
  await setSettingJson(
    STREAKS_SETTINGS_KEY,
    input,
    "Streak freeze allowance (per IST calendar month) - see docs/ARCHITECTURE.md D30.",
  );
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "streaks.settings_updated",
    targetType: "settings_kv",
    targetId: STREAKS_SETTINGS_KEY,
    metadata: { previous, next: input },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return input;
}

// The one entry point every "did a learner just do something that counts
// as activity" call site uses for the "learning" streak scope
// (docs/ECONOMY.md decision 5 defines exactly which events these are - in
// short, any event that results in a REAL first-time XP/VM credit via
// src/server/economy/service.ts's creditLessonCompletion, never a replay
// or a failed/below-pass-mark attempt). Idempotent for the caller: safe to
// call multiple times for the same user on the same IST day, and safe
// under concurrent calls (the row lock in recordStreakActivity is what
// actually guarantees it, not this function).
export async function recordLearningActivity(userId: string, at: Date = new Date()) {
  const settings = await getStreaksSettings();
  const todayIst = istDateString(at);
  const result = await recordStreakActivity(userId, "learning", todayIst, settings.streakFreezesPerMonth);
  reportStreakBrokenIfAny(userId, result);
  return result;
}

// docs/ARCHITECTURE.md D69 - shared by both scopes below. Bucketed, not the
// exact day count, same "no finer than needed" rule the other event
// properties follow.
function reportStreakBrokenIfAny(
  userId: string,
  result: { brokeStreak: boolean; previousCurrent: number },
): void {
  if (!result.brokeStreak) return;
  const bucket =
    result.previousCurrent < 7 ? "short" : result.previousCurrent < 30 ? "medium" : "long";
  captureEvent(userId, "streak_broken", { previousStreakBucket: bucket });
}

// The "pulse_check" scope's first (and, until now, only) real caller -
// this row has existed unused since Phase 3 Checkpoint 4 (D30) specifically
// anticipating Phase 5. Called once per completed Pulse Check attempt
// (src/server/pulse-check/service.ts's finishAttempt) - whether or not the
// attempt's VM was capped by D51's daily cap, since the streak is about
// genuine daily engagement, not how much was earned.
export async function recordPulseCheckActivity(userId: string, at: Date = new Date()) {
  const settings = await getStreaksSettings();
  const todayIst = istDateString(at);
  const result = await recordStreakActivity(userId, "pulse_check", todayIst, settings.streakFreezesPerMonth);
  reportStreakBrokenIfAny(userId, result);
  return result;
}

// There's no midnight job: the stored row only ever advances when the user
// does something (recordStreakActivity). So a row can go stale - e.g. a
// learner with a 5-day streak who then vanishes for 10 days still has
// current=5 sitting in the database, because nothing has run to reset it.
// A plain read must not repeat that stale number back to the user as if
// their streak were still alive. This computes what the stored row means
// AS OF TODAY, without writing anything: if today's gap since their last
// activity would trigger a reset were they to act right now, it's already
// effectively broken and reads as 0, even though the row hasn't been
// physically updated yet. It never awards a freeze it hasn't confirmed via
// a real write either - "extend" (including the freeze-covered case) just
// means the existing streak is still intact, so `current` is shown as-is.
function shapeStreak(
  row: Awaited<ReturnType<typeof getStreak>>,
  todayIst: string,
  defaultFreezes: number,
): { current: number; longest: number; freezesLeft: number } {
  if (!row) return { current: 0, longest: 0, freezesLeft: defaultFreezes };

  const freezesLeft = effectiveFreezesLeft(
    row.freezesLeft,
    row.freezesResetMonth,
    todayIst,
    defaultFreezes,
  );
  const gapDays = daysBetweenIstDates(row.lastActiveDateIst, todayIst);
  const transition = computeStreakTransition(gapDays, freezesLeft);
  const current = transition.kind === "reset" ? 0 : row.current;

  return { current, longest: row.longest, freezesLeft };
}

export async function getStreakStats(userId: string, at: Date = new Date()) {
  const settings = await getStreaksSettings();
  const todayIst = istDateString(at);
  const [learning, pulseCheck] = await Promise.all([
    getStreak(userId, "learning" satisfies StreakScope),
    getStreak(userId, "pulse_check" satisfies StreakScope),
  ]);
  return {
    learning: shapeStreak(learning, todayIst, settings.streakFreezesPerMonth),
    pulseCheck: shapeStreak(pulseCheck, todayIst, settings.streakFreezesPerMonth),
  };
}

// Phase 7's streak_risk push notification (src/inngest/functions/
// streak-risk-notifications.ts) - run once, in the evening IST so there's
// still real time left to act. Notifies every learner whose learning streak
// is at risk today (listAtRiskLearningStreaks) regardless of remaining
// freezes - a real lesson is always better than passively spending one.
export async function notifyLearnersWithStreakAtRisk(at: Date = new Date()): Promise<{ notified: number }> {
  const yesterdayIst = istDateString(new Date(at.getTime() - 24 * 60 * 60 * 1000));
  const atRisk = await listAtRiskLearningStreaks(yesterdayIst);

  for (const { userId } of atRisk) {
    await notifyUser(userId, "streak_risk", NOTIFICATION_COPY.streak_risk);
  }

  return { notified: atRisk.length };
}
