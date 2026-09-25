import type { EfficiencySubMetrics } from "@/db/schema/report_card";
import { getPublishedCoachNoteTemplatesByCategory } from "./repo";

export type SubMetricName = keyof EfficiencySubMetrics;

// Strength = the sub-metric that scored highest this period; Gap = lowest
// (PRODUCT_SPEC.md §6). Ties resolve to whichever key iterates first - a
// fixed, deterministic order, not a product-meaningful choice.
export function pickStrengthMetric(subMetrics: EfficiencySubMetrics): SubMetricName {
  return (Object.entries(subMetrics) as [SubMetricName, number][]).reduce((best, cur) =>
    cur[1] > best[1] ? cur : best,
  )[0];
}
export function pickGapMetric(subMetrics: EfficiencySubMetrics): SubMetricName {
  return (Object.entries(subMetrics) as [SubMetricName, number][]).reduce((worst, cur) =>
    cur[1] < worst[1] ? cur : worst,
  )[0];
}

// "The topic with the lowest per-topic mastery % among topics the user
// hasn't revisited in N days" (PRODUCT_SPEC.md §6) - a LIFETIME view (not
// just this report week, unlike the topic-mastery display bars), since
// staleness is about topics NOT touched recently. STALE_DAYS is a fixed v1
// constant, not yet admin-editable like most other tunables in this
// codebase - a reasonable simplification given the number of genuinely new
// constants this one checkpoint already introduces; promote to settings_kv
// if it needs tuning later.
const OPPORTUNITY_STALE_DAYS = 14;

export function pickOpportunityTopic(
  fullHistory: { answeredAt: Date | null; topic: string | null; isCorrect: boolean | null }[],
  now: Date,
): { topic: string; accuracyPct: number } | null {
  const byTopic = new Map<string, { correct: number; total: number; lastAnswered: Date }>();
  for (const row of fullHistory) {
    if (!row.topic || !row.answeredAt) continue;
    const entry = byTopic.get(row.topic) ?? { correct: 0, total: 0, lastAnswered: row.answeredAt };
    entry.total++;
    if (row.isCorrect) entry.correct++;
    if (row.answeredAt > entry.lastAnswered) entry.lastAnswered = row.answeredAt;
    byTopic.set(row.topic, entry);
  }
  if (byTopic.size === 0) return null;

  const staleCutoff = now.getTime() - OPPORTUNITY_STALE_DAYS * 24 * 60 * 60 * 1000;
  const stale = [...byTopic.entries()].filter(([, v]) => v.lastAnswered.getTime() < staleCutoff);
  // Falls back to the lowest-mastery topic among ALL attempted topics if
  // none are stale yet (e.g. a learner active on every topic this week) -
  // never leaves Opportunity empty when there's real topic data to draw on.
  const candidates = stale.length > 0 ? stale : [...byTopic.entries()];

  const [topic, { correct, total }] = candidates.reduce((worst, cur) =>
    cur[1].correct / cur[1].total < worst[1].correct / worst[1].total ? cur : worst,
  );
  return { topic, accuracyPct: Math.round((correct / total) * 100) };
}

// "Derived from consistency/streak data (e.g. best study day of the week,
// or a nudge if the streak broke recently)" (PRODUCT_SPEC.md §6). A broken
// streak takes priority over "best day" - it's the more actionable/timely
// signal for the learner right now.
export function pickHabitDetail(
  completions: { completedAt: Date | null }[],
  streak: { current: number; longest: number },
): { bestWeekday: string | null; streakBroken: boolean } {
  if (streak.current === 0 && streak.longest > 0) {
    return { bestWeekday: null, streakBroken: true };
  }
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const counts = new Map<number, number>();
  for (const c of completions) {
    if (!c.completedAt) continue;
    const dow = c.completedAt.getUTCDay(); // coarse - a full IST-weekday shift is unnecessary for "which day had the most activity"
    counts.set(dow, (counts.get(dow) ?? 0) + 1);
  }
  if (counts.size === 0) return { bestWeekday: null, streakBroken: false };
  const [bestDow] = [...counts.entries()].reduce((best, cur) => (cur[1] > best[1] ? cur : best));
  return { bestWeekday: WEEKDAYS[bestDow]!, streakBroken: false };
}

// Picks one published template at random for the category - more than one
// may exist (see src/db/schema/report_card.ts's comment); a single one is
// always used if that's all that's published. Returns null if none are
// published yet (the report-card job simply omits that note rather than
// blocking the whole snapshot - see src/server/report-card/service.ts).
export async function pickCoachNoteTemplate(category: "strength" | "gap" | "opportunity" | "habit") {
  const templates = await getPublishedCoachNoteTemplatesByCategory(category);
  if (templates.length === 0) return null;
  return templates[Math.floor(Math.random() * templates.length)]!;
}
