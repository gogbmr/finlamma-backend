import { logActivity } from "@/lib/activity-log";
import type { requestMeta } from "@/lib/http";
import { getSettingJson, setSettingJson } from "@/lib/settings";
import { sumXpSince, sumXpTotal } from "@/server/economy/repo";
import { levelForTotalXp } from "./math";
import {
  DEFAULT_LEVEL_CURVE_SETTINGS,
  LEVEL_CURVE_SETTINGS_KEY,
  LevelCurveSettingsSchema,
  type LevelCurveSettings,
} from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;

export async function getLevelCurveSettings(): Promise<LevelCurveSettings> {
  const raw = await getSettingJson(LEVEL_CURVE_SETTINGS_KEY);
  if (raw === null) return DEFAULT_LEVEL_CURVE_SETTINGS;
  const parsed = LevelCurveSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_LEVEL_CURVE_SETTINGS;
}

// Gated on settings.manage (super_admin only) - same narrow trust bar as
// every other learner-wide constant. Level is never stored (see
// src/server/leveling/math.ts), so changing this re-derives every
// learner's level the next time anything reads it - no backfill needed,
// but also no history of what a learner's level "used to be" under the old
// curve.
export async function updateLevelCurveSettings(
  actor: { id: string },
  input: LevelCurveSettings,
  meta: RequestMeta,
): Promise<LevelCurveSettings> {
  const previous = await getLevelCurveSettings();
  await setSettingJson(
    LEVEL_CURVE_SETTINGS_KEY,
    input,
    "Level curve: XP to advance from level L to L+1 = baseXp + stepXp*(L-1). Level is derived " +
      "from total XP on every read, never stored.",
  );
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "leveling.settings_updated",
    targetType: "settings_kv",
    targetId: LEVEL_CURVE_SETTINGS_KEY,
    metadata: { previous, next: input },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return input;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// The one place that combines "how much XP has this user earned" (economy)
// with "what does that mean on the level curve" (this domain) - used by
// both getXpStats (WH-04) and src/server/profile/service.ts's overview
// (PR-01/02), so the two surfaces can never disagree about a learner's
// level.
export async function getLevelInfo(userId: string) {
  const [settings, totalXp] = await Promise.all([getLevelCurveSettings(), sumXpTotal(userId)]);
  return levelForTotalXp(totalXp, settings);
}

export async function getXpStats(userId: string, at: Date = new Date()) {
  const since = new Date(at.getTime() - SEVEN_DAYS_MS);
  const [levelInfo, weeklyXp] = await Promise.all([getLevelInfo(userId), sumXpSince(userId, since)]);
  return { ...levelInfo, weeklyXp };
}
