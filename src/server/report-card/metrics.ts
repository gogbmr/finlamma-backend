import { VideoContentSchema } from "@/server/lessons/schemas";
import type { EfficiencySubMetrics, ModuleBreakdownRow, TopicMasteryRow } from "@/db/schema/report_card";
import { letterGradeForAccuracy } from "@/server/shared/grades";

type AnsweredQuestion = { answeredAt: Date | null; topic: string | null; isCorrect: boolean | null };

function pct(correct: number, total: number): number {
  return total > 0 ? Math.round((correct / total) * 100) : 0;
}

// PRODUCT_SPEC.md §6: "% of questions on a previously-completed topic that
// the user answers correctly when it reappears later ... before any
// repeat-exposure data, retention defaults to current quiz accuracy."
// `history` must be the user's FULL answered-question history (oldest
// first), not just this week's - a "repeat" can only be identified by
// looking further back than the report window itself.
export function computeRetention(
  history: AnsweredQuestion[],
  weekStart: Date,
  weekEnd: Date,
  fallbackAccuracy: number,
): number {
  const firstSeenAt = new Map<string, number>();
  let correct = 0;
  let total = 0;
  for (const row of history) {
    if (!row.topic || !row.answeredAt) continue;
    const firstSeen = firstSeenAt.get(row.topic);
    if (firstSeen === undefined) {
      firstSeenAt.set(row.topic, row.answeredAt.getTime());
      continue; // this IS the first exposure - never itself a "repeat"
    }
    const inWeek = row.answeredAt >= weekStart && row.answeredAt < weekEnd;
    const isRepeat = row.answeredAt.getTime() > firstSeen;
    if (inWeek && isRepeat) {
      total++;
      if (row.isCorrect) correct++;
    }
  }
  return total > 0 ? pct(correct, total) : fallbackAccuracy;
}

// "% of quiz-type answers correct across the period" - `weekAnswers` is
// already pre-filtered to the report window.
export function computeQuizAccuracy(weekAnswers: AnsweredQuestion[]): number {
  const answered = weekAnswers.filter((r) => r.answeredAt !== null);
  return pct(answered.filter((r) => r.isCorrect).length, answered.length);
}

// clamp(video duration / actual time spent watching, 0, 1) x 100
// (PRODUCT_SPEC.md §6). "Actual time spent watching" is approximated here as
// the attempt's own wall-clock startedAt->completedAt span (also includes
// any in-video pop-quiz answering time mixed in) - the closest real,
// already-server-timestamped signal available without a dedicated per-video
// watch timer (which would need new client instrumentation this phase
// doesn't build). Defaults to 100 (no penalty) when no video was completed
// this week - a week spent on Story/Quiz/Doubt Zone instead of Video isn't
// a worse week, this sub-metric simply has nothing to measure.
export function computeWatchSpeed(
  videoAttempts: { startedAt: Date; completedAt: Date | null; content: unknown }[],
): number {
  const ratios: number[] = [];
  for (const attempt of videoAttempts) {
    if (!attempt.completedAt) continue;
    const parsed = VideoContentSchema.safeParse(attempt.content);
    if (!parsed.success) continue;
    const actualSeconds = (attempt.completedAt.getTime() - attempt.startedAt.getTime()) / 1000;
    if (actualSeconds <= 0) continue;
    ratios.push(Math.min(parsed.data.lengthSeconds / actualSeconds, 1));
  }
  if (ratios.length === 0) return 100;
  const avg = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
  return Math.round(avg * 100);
}

// "active days / days in period x 100" - an active day is any IST calendar
// date with at least one completed lesson (same activity signal PR-08's
// dot calendar already uses).
export function computeConsistency(activeDayCount: number, periodDays: number): number {
  return Math.round((activeDayCount / periodDays) * 100);
}

export function computeEfficiencyScore(subMetrics: EfficiencySubMetrics): number {
  const { retention, watchSpeed, quizAccuracy, consistency } = subMetrics;
  return Math.round((retention + watchSpeed + quizAccuracy + consistency) / 4);
}

type LessonCompletion = { worldId: string; lessonId: string; startedAt: Date; completedAt: Date | null };

// PR-31: per-world (module) lessons done / time spent / accuracy / grade
// this week. `minutesSpent` is the same wall-clock-span proxy computeWatchSpeed
// uses, summed - an approximation, not a precise time-on-task measurement.
export function computeModuleBreakdown(
  completions: LessonCompletion[],
  answersWithWorld: { worldId: string; isCorrect: boolean | null }[],
  worldTitles: Map<string, string>,
): ModuleBreakdownRow[] {
  const byWorld = new Map<string, { lessonsCompleted: number; seconds: number }>();
  for (const c of completions) {
    if (!c.completedAt) continue;
    const entry = byWorld.get(c.worldId) ?? { lessonsCompleted: 0, seconds: 0 };
    entry.lessonsCompleted++;
    entry.seconds += Math.max(0, (c.completedAt.getTime() - c.startedAt.getTime()) / 1000);
    byWorld.set(c.worldId, entry);
  }

  const accuracyByWorld = new Map<string, { correct: number; total: number }>();
  for (const a of answersWithWorld) {
    const entry = accuracyByWorld.get(a.worldId) ?? { correct: 0, total: 0 };
    entry.total++;
    if (a.isCorrect) entry.correct++;
    accuracyByWorld.set(a.worldId, entry);
  }

  return [...byWorld.entries()].map(([worldId, { lessonsCompleted, seconds }]) => {
    const acc = accuracyByWorld.get(worldId);
    const accuracyPct = acc ? pct(acc.correct, acc.total) : 0;
    return {
      worldId,
      worldTitle: worldTitles.get(worldId) ?? "Unknown world",
      lessonsCompleted,
      minutesSpent: Math.round(seconds / 60),
      accuracyPct,
      grade: letterGradeForAccuracy(accuracyPct),
    };
  });
}

// PR-14/PR-32/NW-32-style topic mastery bars for the report window.
export function computeTopicMastery(weekAnswers: AnsweredQuestion[]): TopicMasteryRow[] {
  const byTopic = new Map<string, { correct: number; total: number }>();
  for (const row of weekAnswers) {
    if (!row.topic || row.answeredAt === null) continue;
    const entry = byTopic.get(row.topic) ?? { correct: 0, total: 0 };
    entry.total++;
    if (row.isCorrect) entry.correct++;
    byTopic.set(row.topic, entry);
  }
  return [...byTopic.entries()].map(([topic, { correct, total }]) => ({
    topic,
    accuracyPct: pct(correct, total),
  }));
}
