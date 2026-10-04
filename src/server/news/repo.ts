import { and, count, desc, eq, gte, inArray, isNull, like, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { activityLogs, newsDeskPicks, newsRaw, newsReads, newsStories, questions } from "@/db/schema";
import type { LocalizedText } from "@/db/schema/_helpers";
import type { NewsCategory } from "./schemas";
import type { RawNewsItem } from "./providers/mock";

// Idempotent by (source, externalId) - a re-ingestion of an already-seen
// item is a silent no-op, same insert-and-onConflictDoNothing shape as
// every other idempotent write in this codebase (D26/D37/D46).
export async function insertRawItemsIfNew(source: string, items: RawNewsItem[]) {
  if (items.length === 0) return [];
  return db
    .insert(newsRaw)
    .values(
      items.map((item) => ({
        source,
        externalId: item.externalId,
        url: item.url,
        headline: item.headline,
        summary: item.summary,
        publishedAt: item.publishedAt,
        payload: {},
      })),
    )
    .onConflictDoNothing({ target: [newsRaw.source, newsRaw.externalId] })
    .returning();
}

// Raw items with no drafted story yet - what the drafting job works
// through. A left join on newsStories.rawId, filtered to "no match" -
// bounded by ingestion volume (a handful of items/day), never scanning
// full history.
export async function listUndraftedRaw(limit: number) {
  const rows = await db
    .select({ raw: newsRaw })
    .from(newsRaw)
    .leftJoin(newsStories, eq(newsStories.rawId, newsRaw.id))
    .where(isNull(newsStories.id))
    .orderBy(desc(newsRaw.publishedAt))
    .limit(limit);
  return rows.map((r) => r.raw);
}

// Inserts the draft story AND its bundled AI-drafted "Quick Check" MCQ
// (src/server/news/ai.ts) atomically - CLAUDE.md rule 5 (multi-table
// writes in one transaction), so a failure between the two inserts never
// leaves an orphaned story with no question. The question is a plain draft
// `questions` row - draft/publish, topic tagging and everything else about
// it works exactly like a staff-authored question (same admin editor, same
// publish gate) once it exists; `sourceStoryId` is the only thing marking
// it as AI-drafted-from-a-story rather than hand-authored. topicId starts
// null (the AI has no knowledge of our topic UUIDs, same reasoning
// news_stories.topicId starts null) - staff tag it before publishing.
export async function insertDraftStoryWithQuestion(input: {
  rawId: string;
  category: NewsCategory;
  impact: "good" | "bad" | "neutral";
  content: { headline: LocalizedText; summary: LocalizedText; body: LocalizedText[] };
  jargon: { term: LocalizedText; explanation: LocalizedText };
  outlet: string;
  sourceUrl: string;
  qualityGrade: "A" | "B" | "C";
  adviceLikeWarnings: string[];
  question: {
    prompt: LocalizedText;
    explanation: LocalizedText;
    options: LocalizedText[];
    correctIndex: number;
  };
}) {
  return db.transaction(async (tx) => {
    const [story] = await tx
      .insert(newsStories)
      .values({
        rawId: input.rawId,
        category: input.category,
        impact: input.impact,
        content: input.content,
        jargon: input.jargon,
        outlet: input.outlet,
        sourceUrl: input.sourceUrl,
        qualityGrade: input.qualityGrade,
        adviceLikeWarnings: input.adviceLikeWarnings,
      })
      .returning();
    const [question] = await tx
      .insert(questions)
      .values({
        format: "single_select",
        sourceStoryId: story.id,
        topicId: null,
        prompt: input.question.prompt,
        explanation: input.question.explanation,
        payload: { options: input.question.options },
        answer: { correctIndex: input.question.correctIndex },
      })
      .returning();
    return { story, question };
  });
}

// Admin pipeline: every story regardless of status, newest first.
export async function listAllStories() {
  return db.select().from(newsStories).orderBy(desc(newsStories.createdAt));
}

export async function getStoryById(id: string) {
  const [row] = await db.select().from(newsStories).where(eq(newsStories.id, id)).limit(1);
  return row ?? null;
}

export async function updateStoryStatusRow(id: string, status: "draft" | "published" | "hidden") {
  const [row] = await db
    .update(newsStories)
    .set(
      status === "published"
        ? { status, publishedAt: new Date() }
        : { status },
    )
    .where(eq(newsStories.id, id))
    .returning();
  return row ?? null;
}

export async function updateStoryQualityOverrideRow(id: string, qualityGradeOverride: "A" | "B" | "C" | null) {
  const [row] = await db
    .update(newsStories)
    .set({ qualityGradeOverride })
    .where(eq(newsStories.id, id))
    .returning();
  return row ?? null;
}

export async function updateStoryTopicRow(id: string, topicId: string | null) {
  const [row] = await db.update(newsStories).set({ topicId }).where(eq(newsStories.id, id)).returning();
  return row ?? null;
}

// News Desk KPI tiles (NW-36): ingested/published/draft counts. A single
// grouped query, not one COUNT per status.
export async function getStoryStatusCounts() {
  const rows = await db
    .select({ status: newsStories.status, n: count() })
    .from(newsStories)
    .groupBy(newsStories.status);
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  return {
    draft: byStatus.draft ?? 0,
    published: byStatus.published ?? 0,
    hidden: byStatus.hidden ?? 0,
  };
}

export async function getRawIngestedCount() {
  const [row] = await db.select({ n: count() }).from(newsRaw);
  return row?.n ?? 0;
}

// One row per unmatched raw item across every source - PostgreSQL's row
// estimate is fine here since this is a KPI tile, not a correctness check.
export async function getUndraftedRawCount() {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(newsRaw)
    .leftJoin(newsStories, eq(newsStories.rawId, newsRaw.id))
    .where(isNull(newsStories.id));
  return Number(row?.n ?? 0);
}

export type NewsFeedCursor = { publishedAt: string; id: string };

// Learner-facing feed (NW-01..07): published only, newest first,
// (publishedAt, id) stable-cursor pattern - same shape as
// listVmoneyLedgerForUser (src/server/economy/repo.ts) so a shared
// publishedAt between two stories never skips or repeats a page.
export async function listPublishedStories(opts: {
  limit: number;
  cursor: NewsFeedCursor | null;
  category: NewsCategory | null;
}) {
  const conditions = [eq(newsStories.status, "published")];
  if (opts.category) conditions.push(eq(newsStories.category, opts.category));
  if (opts.cursor) {
    const cursorPublishedAt = new Date(opts.cursor.publishedAt);
    conditions.push(
      or(
        lt(newsStories.publishedAt, cursorPublishedAt),
        and(eq(newsStories.publishedAt, cursorPublishedAt), lt(newsStories.id, opts.cursor.id)),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(newsStories)
    .where(and(...conditions))
    .orderBy(desc(newsStories.publishedAt), desc(newsStories.id))
    .limit(opts.limit + 1);

  const hasMore = rows.length > opts.limit;
  const page = hasMore ? rows.slice(0, opts.limit) : rows;
  const last = page.at(-1);
  const nextCursor =
    hasMore && last && last.publishedAt
      ? { publishedAt: last.publishedAt.toISOString(), id: last.id }
      : null;
  return { data: page, nextCursor };
}

export async function getPublishedStoryById(id: string) {
  const [row] = await db
    .select()
    .from(newsStories)
    .where(and(eq(newsStories.id, id), eq(newsStories.status, "published")))
    .limit(1);
  return row ?? null;
}

// Which of the given story ids this user has already read - one query for
// a whole feed page, never one per row.
export async function listReadStoryIdsForUser(userId: string, storyIds: string[]) {
  if (storyIds.length === 0) return new Set<string>();
  const rows = await db
    .select({ storyId: newsReads.storyId })
    .from(newsReads)
    .where(and(eq(newsReads.userId, userId), inArray(newsReads.storyId, storyIds)));
  return new Set(rows.map((r) => r.storyId));
}

export async function getExistingRead(userId: string, storyId: string) {
  const [row] = await db
    .select()
    .from(newsReads)
    .where(and(eq(newsReads.userId, userId), eq(newsReads.storyId, storyId)))
    .limit(1);
  return row ?? null;
}

// Idempotent on (userId, storyId) - a re-POST for an already-read story is
// a no-op (returns null from the conflict), same insert-and-
// onConflictDoNothing shape as every other idempotent write in this
// codebase (D26/D37/D46).
export async function insertReadIfNew(userId: string, storyId: string, dwellSeconds: number) {
  const [row] = await db
    .insert(newsReads)
    .values({ userId, storyId, dwellSeconds })
    .onConflictDoNothing({ target: [newsReads.userId, newsReads.storyId] })
    .returning();
  return row ?? null;
}

export async function listActiveDeskPicks() {
  return db.select().from(newsDeskPicks).where(eq(newsDeskPicks.active, true)).orderBy(desc(newsDeskPicks.createdAt));
}

// News Desk's audit log (NW-44) - same LIKE-filter-over-activity_logs
// pattern as the Ops console (src/server/ops/repo.ts's listRecentOpsEvents),
// bounded by LIMIT, never a full scan.
export async function listRecentNewsEvents(limit: number) {
  return db
    .select()
    .from(activityLogs)
    .where(like(activityLogs.action, "news.%"))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);
}

// --- Phase 7: market_news push notification broadcast ---

// Published stories the broadcast job (src/inngest/functions/
// news-notification-broadcast.ts) hasn't fanned out yet. Oldest-published-
// first and limited so one run never tries to notify an unbounded backlog
// at once (e.g. after this feature first ships, with months of
// already-published stories that predate notifiedAt existing at all).
export async function listPublishedStoriesPendingNotification(limit: number) {
  return db
    .select()
    .from(newsStories)
    .where(and(eq(newsStories.status, "published"), isNull(newsStories.notifiedAt)))
    .orderBy(newsStories.publishedAt)
    .limit(limit);
}

export async function markStoryNotified(id: string) {
  await db.update(newsStories).set({ notifiedAt: new Date() }).where(eq(newsStories.id, id));
}

// The broadcast audience: learners who read at least one story in the last
// `sinceDate`..now window - engaged readers only, never every registered
// account, so a learner who's never opened News Desk doesn't get pushed at
// unbounded volume the first time this job runs.
export async function listRecentlyEngagedNewsReaderIds(sinceDate: Date): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: newsReads.userId })
    .from(newsReads)
    .where(gte(newsReads.readAt, sinceDate));
  return rows.map((r) => r.userId);
}
