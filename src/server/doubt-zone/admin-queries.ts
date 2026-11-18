import { and, desc, eq, gte, isNull, lte, type SQL, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { doubtMessageFlagCategoryEnum, doubtMessages, doubtThreads, mentors, users } from "@/db/schema";
import type { LocalizedText } from "@/server/shared/schemas";

// Admin-only, real-DB-paginated read path for the Doubt Zone moderation
// queue (Task 3b follow-up, approved plan) - a NEW file. The existing
// listFlaggedMessagesForReview (src/server/doubt-zone/repo.ts) is
// unmodified; this file never imports requireFullAccess or anything else
// from the app-facing consent/access gate /api/v1 routes use. Metadata
// only, exactly what the page shows today - never message content,
// which stays behind the separate, logged revealFlaggedMessageAction.
// Default order (createdAt descending - newest flag first) matches
// today's listFlaggedMessagesForReview exactly; no staff-selectable sort
// here, same reasoning as Consent's admin-queries.ts.
export type DoubtMessageFlagCategory = (typeof doubtMessageFlagCategoryEnum.enumValues)[number];

export type DoubtZoneAdminRow = {
  id: string;
  threadId: string;
  role: "learner" | "assistant";
  flaggedCategory: DoubtMessageFlagCategory | null;
  createdAt: Date;
  reviewedAt: Date | null;
  firstName: string | null;
  lastInitial: string | null;
  mentorName: LocalizedText;
};

export type DoubtZoneAdminListParams = {
  page: number;
  pageSize: number;
  includeReviewed: boolean;
  flaggedCategory: DoubtMessageFlagCategory | null;
  flaggedFrom: Date | null;
  flaggedTo: Date | null;
};

export async function listFlaggedMessagesForAdmin(
  params: DoubtZoneAdminListParams,
): Promise<{ rows: DoubtZoneAdminRow[]; total: number; page: number; pageCount: number }> {
  const conditions: SQL[] = [eq(doubtMessages.flagged, true)];
  if (!params.includeReviewed) conditions.push(isNull(doubtMessages.reviewedAt));
  if (params.flaggedCategory) conditions.push(eq(doubtMessages.flaggedCategory, params.flaggedCategory));
  if (params.flaggedFrom) conditions.push(gte(doubtMessages.createdAt, params.flaggedFrom));
  if (params.flaggedTo) conditions.push(lte(doubtMessages.createdAt, params.flaggedTo));
  const where = and(...conditions);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(doubtMessages)
    .innerJoin(doubtThreads, eq(doubtThreads.id, doubtMessages.threadId))
    .innerJoin(users, eq(users.id, doubtThreads.userId))
    .innerJoin(mentors, eq(mentors.id, doubtThreads.mentorId))
    .where(where);

  const pageCount = Math.max(1, Math.ceil(count / params.pageSize));
  const page = Math.min(Math.max(1, params.page), pageCount);

  const rows = await db
    .select({
      id: doubtMessages.id,
      threadId: doubtMessages.threadId,
      role: doubtMessages.role,
      flaggedCategory: doubtMessages.flaggedCategory,
      createdAt: doubtMessages.createdAt,
      reviewedAt: doubtMessages.reviewedAt,
      firstName: users.firstName,
      lastInitial: users.lastInitial,
      mentorName: mentors.name,
    })
    .from(doubtMessages)
    .innerJoin(doubtThreads, eq(doubtThreads.id, doubtMessages.threadId))
    .innerJoin(users, eq(users.id, doubtThreads.userId))
    .innerJoin(mentors, eq(mentors.id, doubtThreads.mentorId))
    .where(where)
    // A secondary tiebreaker on id keeps page boundaries stable when many
    // messages share the same createdAt.
    .orderBy(desc(doubtMessages.createdAt), desc(doubtMessages.id))
    .limit(params.pageSize)
    .offset((page - 1) * params.pageSize);

  return { rows, total: count, page, pageCount };
}
