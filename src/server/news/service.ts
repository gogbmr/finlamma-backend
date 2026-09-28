import { logActivity } from "@/lib/activity-log";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import { decodeCursor, encodeCursor, logInternalError } from "@/lib/http";
import { getSettingJson, setSettingJson } from "@/lib/settings";
import { findAdviceLikePhrases } from "@/server/trading/advice-language";
import { draftNewsStoryFromRaw } from "./ai";
import { computeQualityGrade } from "./grading";
import { getNewsProvider } from "./providers";
import { computeMinReadSeconds } from "./reading-time";
import {
  getExistingRead,
  getPublishedStoryById,
  getRawIngestedCount,
  getStoryById,
  getStoryStatusCounts,
  getUndraftedRawCount,
  insertDraftStory,
  insertRawItemsIfNew,
  insertReadIfNew,
  listActiveDeskPicks,
  listAllStories,
  listPublishedStories,
  listReadStoryIdsForUser,
  listRecentNewsEvents,
  listUndraftedRaw,
  type NewsFeedCursor,
  updateStoryQualityOverrideRow,
  updateStoryStatusRow,
  updateStoryTopicRow,
} from "./repo";
import type { NewsCategory } from "./schemas";
import {
  DEFAULT_NEWS_QUIZ_GENERATOR_SETTINGS,
  NEWS_QUIZ_GENERATOR_SETTINGS_KEY,
  NewsQuizGeneratorSettingsSchema,
  type NewsQuizGeneratorSettings,
} from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;

// --- Ingestion + AI drafting (called from Inngest jobs, no staff actor) ---

// D50 (docs/ARCHITECTURE.md): getNewsProvider() only ever returns
// MockNewsProvider today - this function's job is to move raw items into
// news_raw, dedup'd, regardless of which provider is actually configured,
// so swapping in a real vendor later needs zero changes here.
export async function ingestLatestNews(): Promise<{ inserted: number }> {
  const provider = getNewsProvider();
  const items = await provider.fetchLatest();
  const inserted = await insertRawItemsIfNew("mock", items);
  return { inserted: inserted.length };
}

// One raw item -> one draft news_stories row, quality-graded, advice-
// language-checked. Never learner-visible (status defaults to "draft") -
// CLAUDE.md rule 11. A single item's AI failure is logged and skipped, same
// "one bad item never blocks the batch" pattern as amfi-nav-ingest.ts -
// never a partial/fabricated draft.
export async function draftPendingStories(limit = 10): Promise<{ drafted: number; failed: number }> {
  const pending = await listUndraftedRaw(limit);
  let drafted = 0;
  let failed = 0;

  for (const raw of pending) {
    try {
      const draft = await draftNewsStoryFromRaw(raw);

      const adviceLikeWarnings = [
        ...findAdviceLikePhrases(draft.content.headline.en),
        ...findAdviceLikePhrases(draft.content.summary.en),
        ...draft.content.body.flatMap((p) => findAdviceLikePhrases(p.en)),
        ...findAdviceLikePhrases(draft.jargon.explanation.en),
      ];

      const qualityGrade = computeQualityGrade({
        bodyParagraphCount: draft.content.body.length,
        summaryWordCount: draft.content.summary.en.split(/\s+/).filter(Boolean).length,
        hasJargon: draft.jargon.term.en.trim().length > 0,
        adviceLikeWarningCount: adviceLikeWarnings.length,
      });

      await insertDraftStory({
        rawId: raw.id,
        category: draft.category,
        impact: draft.impact,
        content: draft.content,
        jargon: draft.jargon,
        outlet: raw.source,
        sourceUrl: raw.url,
        qualityGrade,
        adviceLikeWarnings,
      });
      drafted++;
    } catch (err) {
      logInternalError("news.draft_failed", err);
      failed++;
    }
  }

  return { drafted, failed };
}

// --- Learner-facing feed (NW-01..11) ---

export async function getNewsFeed(
  userId: string,
  opts: { limit: number; cursor: string | null; category: NewsCategory | null },
) {
  const cursor = decodeCursor<NewsFeedCursor>(opts.cursor);
  const { data, nextCursor } = await listPublishedStories({
    limit: opts.limit,
    cursor,
    category: opts.category,
  });
  const readIds = await listReadStoryIdsForUser(
    userId,
    data.map((s) => s.id),
  );
  return {
    data: data.map((s) => ({
      id: s.id,
      headline: s.content.headline,
      summary: s.content.summary,
      category: s.category,
      impact: s.impact,
      outlet: s.outlet,
      featured: s.featured,
      publishedAt: (s.publishedAt ?? s.createdAt).toISOString(),
      read: readIds.has(s.id),
    })),
    nextCursor: nextCursor ? encodeCursor(nextCursor) : null,
  };
}

export async function getNewsStoryDetail(userId: string, id: string) {
  const story = await getPublishedStoryById(id);
  if (!story) throw new AppError("NOT_FOUND", "No published news story with this id");

  const [existingRead] = await Promise.all([getExistingRead(userId, id)]);
  return {
    id: story.id,
    headline: story.content.headline,
    summary: story.content.summary,
    body: story.content.body,
    jargon: story.jargon,
    category: story.category,
    impact: story.impact,
    outlet: story.outlet,
    sourceUrl: story.sourceUrl,
    publishedAt: (story.publishedAt ?? story.createdAt).toISOString(),
    read: existingRead !== null,
    minReadSeconds: computeMinReadSeconds(story.content.body.map((p) => p.en)),
  };
}

// NW-09: server-validated, not client-trusted - the client's own
// dwellSeconds is checked against a real minimum computed from the
// story's own content length (src/server/news/reading-time.ts), not just
// accepted at face value. Idempotent: a repeat POST for an already-read
// story returns { read: true, alreadyRead: true } rather than an error or
// a second logged event.
export async function markNewsStoryRead(user: { id: string }, storyId: string, dwellSeconds: number, meta: RequestMeta) {
  const story = await getPublishedStoryById(storyId);
  if (!story) throw new AppError("NOT_FOUND", "No published news story with this id");

  const existing = await getExistingRead(user.id, storyId);
  if (existing) return { read: true, alreadyRead: true };

  const minRequired = computeMinReadSeconds(story.content.body.map((p) => p.en));
  if (dwellSeconds < minRequired) {
    throw new AppError("NEWS_READ_TOO_SOON", `Keep reading for at least ${minRequired} seconds`);
  }

  const inserted = await insertReadIfNew(user.id, storyId, dwellSeconds);
  if (!inserted) return { read: true, alreadyRead: true }; // lost a race with a concurrent identical request

  await logActivity({
    actorType: "user",
    actorId: user.id,
    action: "news.story_read",
    targetType: "news_stories",
    targetId: storyId,
    metadata: { dwellSeconds },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return { read: true, alreadyRead: false };
}

export async function getNewsDeskPicksForApp() {
  return listActiveDeskPicks();
}

// --- News Desk admin (staff actions) ---

export async function getNewsPipelineForAdmin() {
  return listAllStories();
}

export async function getNewsAuditLogForAdmin(limit = 25) {
  return listRecentNewsEvents(limit);
}

export async function getNewsKpisForAdmin() {
  const [statusCounts, ingested, undrafted] = await Promise.all([
    getStoryStatusCounts(),
    getRawIngestedCount(),
    getUndraftedRawCount(),
  ]);
  return {
    ingestedCount: ingested,
    undraftedCount: undrafted,
    draftCount: statusCounts.draft,
    publishedCount: statusCounts.published,
    hiddenCount: statusCounts.hidden,
  };
}

// The instant publish/hidden toggle (NW-37) - also what pulls an already-
// published story fast (status: "hidden"), same reasoning D20's hotfix
// mechanism and TR-49's symbol-halt toggle both already established for
// this codebase: a single logged, permission-gated write, no approval chain.
export async function updateNewsStoryStatusForAdmin(
  actor: { id: string },
  id: string,
  status: "draft" | "published" | "hidden",
  meta: RequestMeta,
) {
  const previous = await getStoryById(id);
  if (!previous) throw new AppError("NOT_FOUND", "News story not found");

  const updated = await updateStoryStatusRow(id, status);
  if (!updated) throw new AppError("NOT_FOUND", "News story not found");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "news.story_status_updated",
    targetType: "news_stories",
    targetId: id,
    metadata: { previous: previous.status, next: status },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

export async function updateNewsStoryQualityOverrideForAdmin(
  actor: { id: string },
  id: string,
  qualityGradeOverride: "A" | "B" | "C" | null,
  meta: RequestMeta,
) {
  const previous = await getStoryById(id);
  if (!previous) throw new AppError("NOT_FOUND", "News story not found");

  const updated = await updateStoryQualityOverrideRow(id, qualityGradeOverride);
  if (!updated) throw new AppError("NOT_FOUND", "News story not found");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "news.story_quality_override_updated",
    targetType: "news_stories",
    targetId: id,
    metadata: { previous: previous.qualityGradeOverride, next: qualityGradeOverride },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

export async function updateNewsStoryTopicForAdmin(
  actor: { id: string },
  id: string,
  topicId: string | null,
  meta: RequestMeta,
) {
  const previous = await getStoryById(id);
  if (!previous) throw new AppError("NOT_FOUND", "News story not found");

  const updated = await updateStoryTopicRow(id, topicId);
  if (!updated) throw new AppError("NOT_FOUND", "News story not found");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "news.story_topic_updated",
    targetType: "news_stories",
    targetId: id,
    metadata: { previous: previous.topicId, next: topicId },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

// --- Quiz generator settings (NW-38..42), settings_kv-driven, same
// fallback-to-default pattern as getLessonFlowScoringSettings ---

export async function getNewsQuizGeneratorSettings(): Promise<NewsQuizGeneratorSettings> {
  const raw = await getSettingJson(NEWS_QUIZ_GENERATOR_SETTINGS_KEY);
  if (raw === null) return DEFAULT_NEWS_QUIZ_GENERATOR_SETTINGS;
  const parsed = NewsQuizGeneratorSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_NEWS_QUIZ_GENERATOR_SETTINGS;
}

// Gated on settings.manage (super_admin only), same trust bar as every
// other "changes what every learner's session looks like/earns" constant
// (lesson_flow_scoring, vm_issuance_multiplier) - not news.manage/publish,
// since this isn't about a specific story, it's a global Pulse Check knob.
export async function updateNewsQuizGeneratorSettings(
  actor: { id: string },
  input: NewsQuizGeneratorSettings,
  meta: RequestMeta,
): Promise<NewsQuizGeneratorSettings> {
  const previous = await getNewsQuizGeneratorSettings();
  await setSettingJson(
    NEWS_QUIZ_GENERATOR_SETTINGS_KEY,
    input,
    "Pulse Check quiz generator settings (question count, per-question timer, base VM, enabled formats).",
  );

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "news.quiz_generator_settings_updated",
    targetType: "settings_kv",
    targetId: NEWS_QUIZ_GENERATOR_SETTINGS_KEY,
    metadata: { previous, next: input },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return input;
}
