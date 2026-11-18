import { and, asc, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { questions } from "@/db/schema";
import { buildContainsPattern } from "@/lib/admin/sql-search";
import type { QuestionFormat } from "./schemas";

// Admin-only, real-DB-paginated read path for the Questions list (Task
// 3b) - deliberately separate from repo.ts/service.ts, never editing
// either: questions is a growing table (unlike Task 3a's small catalogs),
// so the admin list can't load every row into memory the way
// getQuestionEditorData() does for the editor. That existing function,
// and the rest of repo.ts/service.ts, are untouched - this file only adds
// a new, parallel read path for the list page. getQuestionDetailForAdmin
// below is a thin, unmodified re-export of getQuestionById (already in
// repo.ts) - the edit form still loads a question's full record "the way
// it does today", just fetched on demand per selection instead of being
// already in memory from a full-table list.
export const QUESTION_ADMIN_SORT_COLUMNS = ["createdAt", "status", "format"] as const;
export type QuestionAdminSortColumn = (typeof QUESTION_ADMIN_SORT_COLUMNS)[number];

const SORT_COLUMN = {
  createdAt: questions.createdAt,
  status: questions.status,
  format: questions.format,
} as const;

export type QuestionAdminRow = {
  id: string;
  format: QuestionFormat;
  topicId: string | null;
  promptEn: string;
  status: "draft" | "published";
};

export type QuestionAdminListParams = {
  page: number;
  pageSize: number;
  sort: QuestionAdminSortColumn;
  dir: "asc" | "desc";
  q: string;
  format: QuestionFormat | null;
  status: "draft" | "published" | null;
  topicId: string | null;
};

// Only the fields the admin list table shows (id, format, topicId, the
// prompt's English text, status) - never payload/answer/explanation,
// which the table never displays. limit/offset + a separate count(*) -
// not cursor pagination, since the admin list needs page numbers/total
// count, unlike the app-facing feed-style endpoints.
export async function listQuestionsForAdmin(
  params: QuestionAdminListParams,
): Promise<{ rows: QuestionAdminRow[]; total: number; page: number; pageCount: number }> {
  const conditions: SQL[] = [];
  if (params.format) conditions.push(eq(questions.format, params.format));
  if (params.status) conditions.push(eq(questions.status, params.status));
  if (params.topicId) conditions.push(eq(questions.topicId, params.topicId));
  // Searches the prompt's en/hi/hx text (OR'd), each via a parameterized
  // ILIKE on its own jsonb path - never string-built SQL. A staff member
  // fluent in Hindi typing a Hindi prompt shouldn't come up empty.
  // buildContainsPattern caps length and escapes %/_ in the user's input
  // before it's bound as the pattern value, once, reused for all three
  // languages; Postgres's default backslash ESCAPE applies to that bound
  // value, not to anything interpolated into the query text.
  if (params.q.trim()) {
    const pattern = buildContainsPattern(params.q);
    // drizzle's or() types as SQL | undefined (its general signature
    // accepts possibly-undefined conditions) - with 3 always-defined
    // ilike() calls it can never actually be undefined here.
    conditions.push(
      or(
        ilike(sql`${questions.prompt}->>'en'`, pattern),
        ilike(sql`${questions.prompt}->>'hi'`, pattern),
        ilike(sql`${questions.prompt}->>'hx'`, pattern),
      )!,
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(questions)
    .where(where);

  const pageCount = Math.max(1, Math.ceil(count / params.pageSize));
  const page = Math.min(Math.max(1, params.page), pageCount);
  const orderColumn = SORT_COLUMN[params.sort];
  const orderBy = params.dir === "desc" ? desc(orderColumn) : asc(orderColumn);

  const rows = await db
    .select({
      id: questions.id,
      format: questions.format,
      topicId: questions.topicId,
      promptEn: sql<string>`${questions.prompt}->>'en'`,
      status: questions.status,
    })
    .from(questions)
    .where(where)
    // A secondary tiebreaker on id keeps page boundaries stable when the
    // primary sort column has duplicate values across many rows (e.g.
    // several questions created in the same transaction).
    .orderBy(orderBy, desc(questions.id))
    .limit(params.pageSize)
    .offset((page - 1) * params.pageSize);

  return { rows, total: count, page, pageCount };
}

export { getQuestionById as getQuestionDetailForAdmin } from "./repo";
