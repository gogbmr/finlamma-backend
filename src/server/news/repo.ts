import { count, desc, eq, isNull, like, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { activityLogs, newsRaw, newsStories } from "@/db/schema";
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

export async function insertDraftStory(input: {
  rawId: string;
  category: NewsCategory;
  impact: "good" | "bad" | "neutral";
  content: { headline: LocalizedText; summary: LocalizedText; body: LocalizedText[] };
  jargon: { term: LocalizedText; explanation: LocalizedText };
  outlet: string;
  sourceUrl: string;
  qualityGrade: "A" | "B" | "C";
  adviceLikeWarnings: string[];
}) {
  const [row] = await db.insert(newsStories).values(input).returning();
  return row;
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
