import { logActivity } from "@/lib/activity-log";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import { istDateString, istWeekStartDate, istWeekStartUtc } from "@/lib/ist-date";
import { getConsentRecord, getParentContact } from "@/server/onboarding/repo";
import { isMinor } from "@/server/onboarding/service";
import type { LocalizedText } from "@/server/shared/schemas";
import { getStreakStats } from "@/server/streaks/service";
import { getWorldById } from "@/server/worlds/repo";
import {
  pickCoachNoteTemplate,
  pickGapMetric,
  pickHabitDetail,
  pickOpportunityTopic,
  pickStrengthMetric,
  type SubMetricName,
} from "./coach-notes";
import {
  computeConsistency,
  computeEfficiencyScore,
  computeModuleBreakdown,
  computeQuizAccuracy,
  computeRetention,
  computeTopicMastery,
  computeWatchSpeed,
} from "./metrics";
import {
  getCoachNoteTemplateById,
  getReportSnapshot,
  insertDraftCoachNoteTemplate,
  insertReportSnapshot,
  listAllCoachNoteTemplates,
  listAnsweredQuestionHistoryForUser,
  listAnsweredQuestionsWithWorldForUserInRange,
  listCompletedGradedLessonsForUserInRange,
  listCompletedUngradedLessonsForUserInRange,
  listCompletedVideoAttemptsForUserInRange,
  listReportSnapshotsForUser,
  publishCoachNoteTemplateRow,
  unpublishCoachNoteTemplateRow,
  updateDraftCoachNoteTemplate,
  type CoachNoteCategory,
} from "./repo";
import type { CreateCoachNoteTemplateInput, UpdateCoachNoteTemplateInput } from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;
type ReportSnapshotRow = NonNullable<Awaited<ReturnType<typeof getReportSnapshot>>>;

// --- Admin: coach note templates (D34, docs/ARCHITECTURE.md - tone rule
// enforced in the editor's help text, src/app/admin/(dashboard)/report-card) ---

export async function getCoachNoteTemplateEditorData() {
  return listAllCoachNoteTemplates();
}

export async function createCoachNoteTemplate(
  actor: { id: string },
  input: CreateCoachNoteTemplateInput,
  meta: RequestMeta,
) {
  const created = await insertDraftCoachNoteTemplate(input);
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "coach_note_template.created",
    targetType: "coach_note_template",
    targetId: created.id,
    metadata: { category: created.category },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return created;
}

export async function updateCoachNoteTemplate(
  actor: { id: string },
  input: UpdateCoachNoteTemplateInput,
  meta: RequestMeta,
) {
  const updated = await updateDraftCoachNoteTemplate(input);
  if (!updated) throw new AppError("NOT_FOUND", "Template not found");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "coach_note_template.draft_saved",
    targetType: "coach_note_template",
    targetId: updated.id,
    metadata: { category: updated.category },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

function validateTemplateForPublish(template: LocalizedText): void {
  const missing = (["en", "hi", "hx"] as const).filter((lang) => !template[lang]?.trim());
  if (missing.length > 0) {
    throw new AppError("VALIDATION_FAILED", `Cannot publish: missing template.${missing.join(", template.")}`, {
      missingFields: missing.map((l) => `template.${l}`),
    });
  }
}

export async function publishCoachNoteTemplate(actor: { id: string }, id: string, meta: RequestMeta) {
  const existing = await getCoachNoteTemplateById(id);
  if (!existing) throw new AppError("NOT_FOUND", "Template not found");
  if (existing.status !== "draft") throw new AppError("CONFLICT", "Template is not a draft");
  validateTemplateForPublish(existing.template);

  const published = await publishCoachNoteTemplateRow(id, actor.id);
  if (!published) throw new AppError("CONFLICT", "Template is not a draft");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "coach_note_template.published",
    targetType: "coach_note_template",
    targetId: published.id,
    metadata: { category: published.category },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return published;
}

export async function unpublishCoachNoteTemplate(actor: { id: string }, id: string, meta: RequestMeta) {
  const unpublished = await unpublishCoachNoteTemplateRow(id);
  if (!unpublished) throw new AppError("CONFLICT", "Template not found, or it's not published");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "coach_note_template.unpublished",
    targetType: "coach_note_template",
    targetId: unpublished.id,
    metadata: { category: unpublished.category },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return unpublished;
}

// --- Weekly snapshot computation (the Monday-IST Inngest job's core logic) ---

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Idempotent: report_snapshots' (userId, weekStartDate) unique constraint
// means a retried/duplicate job run for the same user+week is always a
// silent no-op (this function returns the EXISTING row without
// recomputing) - the same D26-style guarantee every other "write once"
// operation in this codebase relies on.
export async function computeAndStoreWeeklySnapshot(
  userId: string,
  at: Date = new Date(),
): Promise<ReportSnapshotRow> {
  const weekStartDate = istWeekStartDate(at);
  const existing = await getReportSnapshot(userId, weekStartDate);
  if (existing) return existing;

  const weekStart = istWeekStartUtc(at);
  const weekEnd = new Date(weekStart.getTime() + WEEK_MS);

  const [fullHistory, videoAttempts, gradedCompletions, ungradedCompletions, answersWithWorld, streakStats] =
    await Promise.all([
      listAnsweredQuestionHistoryForUser(userId),
      listCompletedVideoAttemptsForUserInRange(userId, weekStart, weekEnd),
      listCompletedGradedLessonsForUserInRange(userId, weekStart, weekEnd),
      listCompletedUngradedLessonsForUserInRange(userId, weekStart, weekEnd),
      listAnsweredQuestionsWithWorldForUserInRange(userId, weekStart, weekEnd),
      getStreakStats(userId, at),
    ]);

  const weekAnswers = fullHistory.filter(
    (a) => a.answeredAt && a.answeredAt >= weekStart && a.answeredAt < weekEnd,
  );
  const quizAccuracy = computeQuizAccuracy(weekAnswers);
  const retention = computeRetention(fullHistory, weekStart, weekEnd, quizAccuracy);
  const watchSpeed = computeWatchSpeed(videoAttempts);

  const allCompletions = [...gradedCompletions, ...ungradedCompletions];
  const activeDates = new Set(
    allCompletions.filter((c) => c.completedAt).map((c) => istDateString(c.completedAt!)),
  );
  const consistency = computeConsistency(activeDates.size, 7);

  const subMetrics = { retention, watchSpeed, quizAccuracy, consistency };
  const efficiencyScore = computeEfficiencyScore(subMetrics);

  const worldIds = [...new Set(allCompletions.map((c) => c.worldId))];
  const worldTitlePairs = await Promise.all(
    worldIds.map(async (id) => [id, (await getWorldById(id))?.title.en ?? "Unknown world"] as const),
  );
  const moduleBreakdown = computeModuleBreakdown(allCompletions, answersWithWorld, new Map(worldTitlePairs));
  const topicMastery = computeTopicMastery(weekAnswers);

  const opportunityTopic = pickOpportunityTopic(fullHistory, at);
  const habitDetail = pickHabitDetail(allCompletions, streakStats.learning);

  const [strengthTemplate, gapTemplate, opportunityTemplate, habitTemplate] = await Promise.all([
    pickCoachNoteTemplate("strength"),
    pickCoachNoteTemplate("gap"),
    opportunityTopic ? pickCoachNoteTemplate("opportunity") : Promise.resolve(null),
    pickCoachNoteTemplate("habit"),
  ]);

  const inserted = await insertReportSnapshot({
    userId,
    weekStartDate,
    efficiencyScore,
    subMetrics,
    moduleBreakdown,
    topicMastery,
    strengthNoteId: strengthTemplate?.id ?? null,
    gapNoteId: gapTemplate?.id ?? null,
    opportunityNoteId: opportunityTemplate?.id ?? null,
    habitNoteId: habitTemplate?.id ?? null,
    opportunityTopic,
    habitDetail,
  });
  // A concurrent duplicate run (e.g. a retried Inngest step) can lose the
  // insert race - re-read rather than return null, same idempotent-replay
  // shape as every other "insert, treat a conflict as already-done" path.
  return inserted ?? (await getReportSnapshot(userId, weekStartDate))!;
}

// --- Rendering a stored snapshot's coach notes with this learner's own
// numbers filled in - kept separate from computeAndStoreWeeklySnapshot so a
// read (GET /me/report-card) never needs to touch the heavy per-metric
// queries again, only the already-computed snapshot + 4 small template
// lookups. ---

const METRIC_LABELS: Record<SubMetricName, string> = {
  retention: "remembering what you've learned",
  watchSpeed: "pacing through videos",
  quizAccuracy: "quiz accuracy",
  consistency: "showing up regularly",
};

function fillTemplate(template: LocalizedText, values: Record<string, string>): LocalizedText {
  const fill = (text: string) =>
    Object.entries(values).reduce((t, [key, value]) => t.replaceAll(`{{${key}}}`, value), text);
  return { en: fill(template.en), hi: fill(template.hi), hx: fill(template.hx) };
}

async function renderCoachNotes(snapshot: ReportSnapshotRow) {
  const [strengthTpl, gapTpl, opportunityTpl, habitTpl] = await Promise.all([
    snapshot.strengthNoteId ? getCoachNoteTemplateById(snapshot.strengthNoteId) : null,
    snapshot.gapNoteId ? getCoachNoteTemplateById(snapshot.gapNoteId) : null,
    snapshot.opportunityNoteId ? getCoachNoteTemplateById(snapshot.opportunityNoteId) : null,
    snapshot.habitNoteId ? getCoachNoteTemplateById(snapshot.habitNoteId) : null,
  ]);

  const notes: { category: CoachNoteCategory; text: LocalizedText }[] = [];

  if (strengthTpl) {
    const metric = pickStrengthMetric(snapshot.subMetrics);
    notes.push({
      category: "strength",
      text: fillTemplate(strengthTpl.template, {
        metric: METRIC_LABELS[metric],
        pct: String(snapshot.subMetrics[metric]),
      }),
    });
  }
  if (gapTpl) {
    const metric = pickGapMetric(snapshot.subMetrics);
    notes.push({
      category: "gap",
      text: fillTemplate(gapTpl.template, {
        metric: METRIC_LABELS[metric],
        pct: String(snapshot.subMetrics[metric]),
      }),
    });
  }
  if (opportunityTpl && snapshot.opportunityTopic) {
    notes.push({
      category: "opportunity",
      text: fillTemplate(opportunityTpl.template, {
        topic: snapshot.opportunityTopic.topic,
        pct: String(snapshot.opportunityTopic.accuracyPct),
      }),
    });
  }
  if (habitTpl && snapshot.habitDetail) {
    const detail = snapshot.habitDetail.streakBroken
      ? "your streak broke recently - a quick lesson today gets it going again"
      : snapshot.habitDetail.bestWeekday
        ? `${snapshot.habitDetail.bestWeekday}s are your strongest study day`
        : null;
    if (detail) {
      notes.push({ category: "habit", text: fillTemplate(habitTpl.template, { detail }) });
    }
  }
  return notes;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local[0]}***@${domain}`;
}

// D33 (docs/ARCHITECTURE.md): re-checked on every call, never cached or
// decided once - a learner who turns 18, or whose parent withdraws/never
// opted in, simply stops qualifying the very next check, with no explicit
// offboarding step. Used by BOTH the in-app masked display
// (getSharedWithParentInfo below) and the weekly Inngest job's real send
// (src/inngest/functions/weekly-report-card.ts) - one eligibility rule, not
// two that could drift apart.
export async function getEligibleParentContactForWeeklyReport(
  user: { id: string; dateOfBirth: string | null },
): Promise<{ email: string } | null> {
  if (!user.dateOfBirth || !isMinor(user.dateOfBirth)) return null;

  const [consent, parentContact] = await Promise.all([getConsentRecord(user.id), getParentContact(user.id)]);
  if (consent?.status !== "consented" || !parentContact?.weeklyReportOptIn) return null;

  return { email: parentContact.email };
}

async function getSharedWithParentInfo(
  user: { id: string; dateOfBirth: string | null },
): Promise<{ maskedEmail: string } | null> {
  const eligible = await getEligibleParentContactForWeeklyReport(user);
  return eligible ? { maskedEmail: maskEmail(eligible.email) } : null;
}

// PR-30/31/32/33: the caller's own weekly report card - current week's
// snapshot (or null if the first Monday since signup hasn't run yet), an
// 8-week efficiency-score trend, and whether it's currently shared with a
// parent (D33).
export async function getMyReportCard(
  user: { id: string; dateOfBirth: string | null },
  at: Date = new Date(),
) {
  const weekStartDate = istWeekStartDate(at);
  const [current, recent, sharedWithParent] = await Promise.all([
    getReportSnapshot(user.id, weekStartDate),
    listReportSnapshotsForUser(user.id, 8),
    getSharedWithParentInfo(user),
  ]);

  const coachNotes = current ? await renderCoachNotes(current) : [];

  return {
    current: current
      ? {
          weekStartDate: current.weekStartDate,
          efficiencyScore: current.efficiencyScore,
          subMetrics: current.subMetrics,
          moduleBreakdown: current.moduleBreakdown,
          topicMastery: current.topicMastery,
          coachNotes,
        }
      : null,
    trend: recent
      .map((s) => ({ weekStartDate: s.weekStartDate, efficiencyScore: s.efficiencyScore }))
      .reverse(),
    sharedWithParent,
  };
}
