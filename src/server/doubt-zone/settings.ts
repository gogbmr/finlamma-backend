import { logActivity } from "@/lib/activity-log";
import type { requestMeta } from "@/lib/http";
import { getSettingJson, setSettingJson } from "@/lib/settings";
import {
  DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS,
  DOUBT_ZONE_SAFETY_SETTINGS_KEY,
  DoubtZoneSafetySettingsSchema,
  type DoubtZoneSafetySettings,
} from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;

// Falls back to DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS if the row hasn't been
// seeded, or a stored value no longer matches the current shape (e.g. after
// a field was added) - a settings_kv shape drift must never silently
// disable the safety redirect or loosen the flag threshold, so an invalid
// stored value falls back to the safe default rather than throwing.
export async function getDoubtZoneSafetySettings(): Promise<DoubtZoneSafetySettings> {
  const raw = await getSettingJson(DOUBT_ZONE_SAFETY_SETTINGS_KEY);
  if (raw === null) return DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS;
  const parsed = DoubtZoneSafetySettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS;
}

// Gated on settings.manage, same narrow super_admin-only trust bar as
// lesson-flow scoring and every other founder-only constant - this one
// controls crisis-redirect wording and safety-classifier sensitivity, so
// it's at least as sensitive as a money constant.
export async function updateDoubtZoneSafetySettings(
  actor: { id: string },
  input: DoubtZoneSafetySettings,
  meta: RequestMeta,
): Promise<DoubtZoneSafetySettings> {
  const previous = await getDoubtZoneSafetySettings();
  await setSettingJson(
    DOUBT_ZONE_SAFETY_SETTINGS_KEY,
    input,
    "Doubt Zone AI safety settings: crisis helpline redirect text, advice-language fallback, " +
      "thread disclosure copy, safety-classifier sensitivity, and daily message caps. See " +
      "docs/ARCHITECTURE.md's Phase 7 kickoff decisions. Editable only by super_admin " +
      "(settings.manage), logged.",
  );

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "settings.doubt_zone_safety_updated",
    targetType: "settings_kv",
    targetId: DOUBT_ZONE_SAFETY_SETTINGS_KEY,
    metadata: { previous, next: input },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return input;
}
