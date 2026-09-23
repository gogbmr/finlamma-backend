import { logActivity } from "@/lib/activity-log";
import type { requestMeta } from "@/lib/http";
import { istDateString } from "@/lib/ist-date";
import { getSettingJson, setSettingJson } from "@/lib/settings";
import { getStreak, recordStreakActivity, type StreakScope } from "./repo";
import {
  DEFAULT_STREAKS_SETTINGS,
  STREAKS_SETTINGS_KEY,
  StreaksSettingsSchema,
  type StreaksSettings,
} from "./schemas";

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
  return recordStreakActivity(userId, "learning", todayIst, settings.streakFreezesPerMonth);
}

function shapeStreak(
  row: Awaited<ReturnType<typeof getStreak>>,
  defaultFreezes: number,
): { current: number; longest: number; freezesLeft: number } {
  if (!row) return { current: 0, longest: 0, freezesLeft: defaultFreezes };
  return { current: row.current, longest: row.longest, freezesLeft: row.freezesLeft };
}

export async function getStreakStats(userId: string) {
  const settings = await getStreaksSettings();
  const [learning, pulseCheck] = await Promise.all([
    getStreak(userId, "learning" satisfies StreakScope),
    getStreak(userId, "pulse_check" satisfies StreakScope),
  ]);
  return {
    learning: shapeStreak(learning, settings.streakFreezesPerMonth),
    pulseCheck: shapeStreak(pulseCheck, settings.streakFreezesPerMonth),
  };
}
