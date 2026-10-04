import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { activityLogs, entitlements, lessonProgress, sessionTimeDaily, users } from "@/db/schema";

function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

// --- Users (admin analytics dashboard, docs/ARCHITECTURE.md D69) ---
// Every query here is either a bounded date-range scan or an explicit
// cache at the service layer - same standard the Ops console already sets
// (docs/ARCHITECTURE.md D48): nothing here is allowed to get slower just
// because total historical signups/activity grows. No query in this file
// ever selects a name, email, or any other learner-identifying column -
// this dashboard shows aggregate patterns, never an individual learner
// (that's the existing logged-reveal pattern - consent.view/trading.ops -
// not this read-only reporting page).

export async function countTotalActiveUsers(): Promise<number> {
  const [row] = await db
    .select({ count: sql<string | number>`count(*)` })
    .from(users)
    .where(isNull(users.deletedAt));
  return toNumber(row?.count ?? 0);
}

// Bounded by the date range, not total signup history.
export async function countNewUsersSince(sinceUtc: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<string | number>`count(*)` })
    .from(users)
    .where(and(gte(users.createdAt, sinceUtc), isNull(users.deletedAt)));
  return toNumber(row?.count ?? 0);
}

// --- Retention ---
// session_time_daily is already a one-row-per-(user, IST day) table
// (src/db/schema/session_time.ts), so "distinct users active since a given
// IST date" is a bounded range scan over that day's rows, never a scan
// over all historical activity.
export async function countDistinctActiveUsersSinceIstDate(sinceIstDate: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<string | number>`count(distinct ${sessionTimeDaily.userId})` })
    .from(sessionTimeDaily)
    .where(gte(sessionTimeDaily.dateIst, sinceIstDate));
  return toNumber(row?.count ?? 0);
}

// --- Lessons ---
export async function countLessonsCompletedSince(sinceUtc: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<string | number>`count(*)` })
    .from(lessonProgress)
    .where(and(eq(lessonProgress.status, "completed"), gte(lessonProgress.completedAt, sinceUtc)));
  return toNumber(row?.count ?? 0);
}

// --- Revenue ---
// Bounded by how many accounts have ever actually purchased ad-free, a
// naturally small subset of total signups - same "bounded by an inherently
// small population, not total table size" reasoning the Ops console's
// sumVmoneyInPlay already relies on for its own all-time aggregate.
export async function countActiveAdFreeEntitlements(now: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<string | number>`count(*)` })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.entitlement, "ad_free"),
        or(isNull(entitlements.expiresAt), gte(entitlements.expiresAt, now)),
      ),
    );
  return toNumber(row?.count ?? 0);
}

// `entitlements` only ever stores CURRENT state (upserted in place, never a
// purchase-history table - src/db/schema/monetisation.ts) - activity_logs'
// "monetisation.entitlement_updated" rows are the only durable record of
// each individual webhook event, including its RevenueCat event type. A
// bounded date-range scan over the already-indexed, time-ordered
// activity_logs table, same pattern src/server/ops/repo.ts's
// listRecentOpsEvents already uses - filtering by eventType happens in JS
// after this bounded fetch, not in SQL, since it's reading a jsonb field
// for a handful of rows (a week's worth of webhook deliveries), not
// filtering a large table.
export async function listEntitlementUpdateEventTypesSince(sinceUtc: Date): Promise<string[]> {
  const rows = await db
    .select({ metadata: activityLogs.metadata })
    .from(activityLogs)
    .where(and(eq(activityLogs.action, "monetisation.entitlement_updated"), gte(activityLogs.createdAt, sinceUtc)));
  return rows
    .map((r) => (r.metadata && typeof r.metadata === "object" ? (r.metadata as Record<string, unknown>).eventType : null))
    .filter((t): t is string => typeof t === "string");
}
