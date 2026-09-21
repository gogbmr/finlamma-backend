import { logActivity } from "@/lib/activity-log";
import type { requestMeta } from "@/lib/http";
import { getSettingJson, setSettingJson } from "@/lib/settings";
import {
  DEFAULT_LESSON_FLOW_SCORING,
  LESSON_FLOW_SCORING_SETTINGS_KEY,
  LessonFlowScoringSchema,
  type LessonFlowScoring,
} from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;

// Falls back to DEFAULT_LESSON_FLOW_SCORING if the row hasn't been seeded,
// or if a stored value somehow no longer matches the current shape (e.g.
// after a field was added/renamed) - scoring must never hard-fail a
// learner's quiz because of a settings_kv shape drift.
export async function getLessonFlowScoringSettings(): Promise<LessonFlowScoring> {
  const raw = await getSettingJson(LESSON_FLOW_SCORING_SETTINGS_KEY);
  if (raw === null) return DEFAULT_LESSON_FLOW_SCORING;
  const parsed = LessonFlowScoringSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_LESSON_FLOW_SCORING;
}

// Gated on settings.manage, seeded (scripts/seed-roles.ts) ONLY to
// super_admin - no other role gets it, unlike every content permission
// which content_publisher/quiz_maker/etc. also hold. Changing a scoring
// constant changes XP for every learner immediately, so this is
// deliberately a narrower trust bar than publishing content.
export async function updateLessonFlowScoringSettings(
  actor: { id: string },
  input: LessonFlowScoring,
  meta: RequestMeta,
): Promise<LessonFlowScoring> {
  const previous = await getLessonFlowScoringSettings();
  await setSettingJson(
    LESSON_FLOW_SCORING_SETTINGS_KEY,
    input,
    "Lesson Flow scoring constants (speed bonus, combo, fever mode, base XP) - see docs/PRODUCT_SPEC.md §1.",
  );

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "settings.lesson_flow_scoring_updated",
    targetType: "settings_kv",
    targetId: LESSON_FLOW_SCORING_SETTINGS_KEY,
    metadata: { previous, next: input },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return input;
}
