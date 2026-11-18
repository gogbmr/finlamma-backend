import { and, asc, eq, gte, isNull, lte, type SQL, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { consentRecords, consentStatusEnum, users } from "@/db/schema";

// Admin-only, real-DB-paginated read path for the Consent review queue
// (Task 3b follow-up, approved plan) - a NEW file. The existing
// listConsentRecordsForReview (src/server/onboarding/repo.ts) is
// unmodified and still there for whatever else calls it; this file never
// imports requireFullAccess or anything else from the app-facing consent
// gate /api/v1 routes use - it's a read query built directly against the
// schema. Fields are exactly what the page shows today, nothing added:
// firstName/lastInitial/status/createdAt(requestedAt)/actedAt/deletedAt -
// never email, phone or date of birth. Default order (createdAt
// ascending - oldest request first) matches today's
// listConsentRecordsForReview exactly; there is no staff-selectable sort
// on this page by design, so a filter can never bury an old/urgent
// pending request behind a sort choice.
export type ConsentStatusFilter = (typeof consentStatusEnum.enumValues)[number];

export type ConsentAdminRow = {
  userId: string;
  firstName: string | null;
  lastInitial: string | null;
  status: ConsentStatusFilter;
  createdAt: Date;
  actedAt: Date | null;
  deletedAt: Date | null;
};

export type ConsentAdminListParams = {
  page: number;
  pageSize: number;
  status: ConsentStatusFilter | null;
  includeDeleted: boolean;
  requestedFrom: Date | null;
  requestedTo: Date | null;
};

export async function listConsentRecordsForAdmin(
  params: ConsentAdminListParams,
): Promise<{ rows: ConsentAdminRow[]; total: number; page: number; pageCount: number }> {
  const conditions: SQL[] = [];
  if (!params.includeDeleted) conditions.push(isNull(users.deletedAt));
  if (params.status) conditions.push(eq(consentRecords.status, params.status));
  if (params.requestedFrom) conditions.push(gte(consentRecords.createdAt, params.requestedFrom));
  if (params.requestedTo) conditions.push(lte(consentRecords.createdAt, params.requestedTo));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(consentRecords)
    .innerJoin(users, eq(users.id, consentRecords.userId))
    .where(where);

  const pageCount = Math.max(1, Math.ceil(count / params.pageSize));
  const page = Math.min(Math.max(1, params.page), pageCount);

  const rows = await db
    .select({
      userId: consentRecords.userId,
      firstName: users.firstName,
      lastInitial: users.lastInitial,
      status: consentRecords.status,
      createdAt: consentRecords.createdAt,
      actedAt: consentRecords.actedAt,
      deletedAt: users.deletedAt,
    })
    .from(consentRecords)
    .innerJoin(users, eq(users.id, consentRecords.userId))
    .where(where)
    // userId is unique per consentRecords row (consent_records_user_id_idx)
    // - a stable secondary tiebreaker for consistent page boundaries when
    // many requests share the same createdAt.
    .orderBy(asc(consentRecords.createdAt), asc(consentRecords.userId))
    .limit(params.pageSize)
    .offset((page - 1) * params.pageSize);

  return { rows, total: count, page, pageCount };
}
