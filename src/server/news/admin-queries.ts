import { and, asc, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { newsCategoryEnum, newsStories } from "@/db/schema";
import { buildContainsPattern } from "@/lib/admin/sql-search";
import type { LocalizedText } from "@/server/shared/schemas";
import { getStoryById } from "./repo";

export type NewsCategory = (typeof newsCategoryEnum.enumValues)[number];

// Admin-only, real-DB-paginated read path for the News Desk pipeline table
// (Task 3b) - deliberately separate from repo.ts/service.ts, never editing
// either: news_stories is a growing table (unlike Task 3a's small
// catalogs), so the pipeline list can't load every row into memory the
// way listAllStories() does for getNewsPipelineForAdmin(). The pipeline
// list row is still deliberately lightweight (status/topic/quality-grade
// stay inline Selects, edited directly in the row, never a separate form -
// see pipeline-table.tsx's own comment); getStoryDetailForAdmin below is
// only for the read-only View page added alongside this comment, same
// "thin re-export of an existing repo function" shape as questions/
// admin-queries.ts's getQuestionDetailForAdmin.
export const NEWS_ADMIN_SORT_COLUMNS = ["createdAt", "status", "category", "qualityGrade"] as const;
export type NewsAdminSortColumn = (typeof NEWS_ADMIN_SORT_COLUMNS)[number];

// Read-only. Returns a story regardless of status (draft/published/hidden)
// - staff reviewing the pipeline need to see a draft's full content before
// publishing it, same reasoning as questions/lessons' own admin detail
// fetches.
export { getStoryById as getStoryDetailForAdmin };

const SORT_COLUMN = {
  createdAt: newsStories.createdAt,
  status: newsStories.status,
  category: newsStories.category,
  qualityGrade: newsStories.qualityGrade,
} as const;

export type NewsStoryAdminRow = {
  id: string;
  headline: LocalizedText;
  outlet: string;
  category: string;
  qualityGrade: "A" | "B" | "C";
  qualityGradeOverride: "A" | "B" | "C" | null;
  topicId: string | null;
  status: "draft" | "published" | "hidden";
  adviceLikeWarnings: string[] | null;
  createdAt: Date;
};

export type NewsAdminListParams = {
  page: number;
  pageSize: number;
  sort: NewsAdminSortColumn;
  dir: "asc" | "desc";
  q: string;
  status: "draft" | "published" | "hidden" | null;
  topicId: string | null;
  category: NewsCategory | null;
};

// Only the fields the pipeline table shows/edits inline - same shape
// PipelineStoryRow already has today. limit/offset + a separate count(*),
// not cursor pagination, since the admin list needs page numbers/total.
export async function listNewsStoriesForAdmin(
  params: NewsAdminListParams,
): Promise<{ rows: NewsStoryAdminRow[]; total: number; page: number; pageCount: number }> {
  const conditions: SQL[] = [];
  if (params.status) conditions.push(eq(newsStories.status, params.status));
  if (params.topicId) conditions.push(eq(newsStories.topicId, params.topicId));
  if (params.category) conditions.push(eq(newsStories.category, params.category));
  // Searches the headline's en/hi/hx text (OR'd), each via a parameterized
  // ILIKE on its own jsonb path - never string-built SQL. buildContainsPattern
  // caps length and escapes %/_ once, reused for all three languages;
  // Postgres's default backslash ESCAPE applies to that bound value, not to
  // anything interpolated into the query text.
  if (params.q.trim()) {
    const pattern = buildContainsPattern(params.q);
    // or() types as SQL | undefined generally, but can never actually be
    // undefined here with 3 always-defined ilike() calls.
    conditions.push(
      or(
        ilike(sql`${newsStories.content}->'headline'->>'en'`, pattern),
        ilike(sql`${newsStories.content}->'headline'->>'hi'`, pattern),
        ilike(sql`${newsStories.content}->'headline'->>'hx'`, pattern),
      )!,
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(newsStories)
    .where(where);

  const pageCount = Math.max(1, Math.ceil(count / params.pageSize));
  const page = Math.min(Math.max(1, params.page), pageCount);
  const orderColumn = SORT_COLUMN[params.sort];
  const orderBy = params.dir === "desc" ? desc(orderColumn) : asc(orderColumn);

  const rows = await db
    .select({
      id: newsStories.id,
      headline: sql<LocalizedText>`${newsStories.content}->'headline'`,
      outlet: newsStories.outlet,
      category: newsStories.category,
      qualityGrade: newsStories.qualityGrade,
      qualityGradeOverride: newsStories.qualityGradeOverride,
      topicId: newsStories.topicId,
      status: newsStories.status,
      adviceLikeWarnings: newsStories.adviceLikeWarnings,
      createdAt: newsStories.createdAt,
    })
    .from(newsStories)
    .where(where)
    // A secondary tiebreaker on id keeps page boundaries stable when the
    // primary sort column has duplicate values across many rows.
    .orderBy(orderBy, desc(newsStories.id))
    .limit(params.pageSize)
    .offset((page - 1) * params.pageSize);

  return { rows, total: count, page, pageCount };
}
