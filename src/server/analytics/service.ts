import {
  DB_CONCURRENCY_LIMIT,
  runWithConcurrencyLimit,
} from "@/lib/concurrency-limit";
import { istDateStartUtc, istDateString } from "@/lib/ist-date";
import { getOrSetJsonCache } from "@/lib/redis";
import { countActiveTradersToday, countOrdersToday } from "@/server/ops/repo";
import { getPulseCheckEngagement } from "@/server/pulse-check/service";
import {
  countActiveAdFreeEntitlements,
  countDistinctActiveUsersSinceIstDate,
  countLessonsCompletedSince,
  countNewUsersSince,
  countTotalActiveUsers,
  listEntitlementUpdateEventTypesSince,
} from "./repo";

const DAYS_MS = 24 * 60 * 60 * 1000;

// RevenueCat event types that represent an actual new purchase, not a
// renewal/cancellation/expiration touching the same entitlements row - same
// gate src/server/monetisation/service.ts's entitlement_purchased analytics
// event uses (docs/ARCHITECTURE.md D69), kept in sync with it here.
const PURCHASE_EVENT_TYPES = new Set([
  "INITIAL_PURCHASE",
  "NON_RENEWING_PURCHASE",
]);

export type AdminAnalyticsSummary = {
  users: { totalActive: number; newToday: number; newLast7Days: number };
  retention: { dau: number; wau: number; mau: number };
  lessons: { completedToday: number; completedLast7Days: number };
  trading: { activeTradersToday: number; ordersToday: number };
  news: { pulseCheckEngagementPct7Day: number; pulseCheckActiveUsers: number };
  revenue: { activeAdFreeEntitlements: number; newPurchasesLast7Days: number };
};

const ANALYTICS_SUMMARY_CACHE_TTL_SECONDS = 300;

// One cached computation for the whole dashboard (docs/ARCHITECTURE.md
// D69) - every number here is either a bounded date-range query
// (src/server/analytics/repo.ts) or reuses an already-bounded/cached
// aggregate another domain already built (the Ops console's trading KPIs,
// Pulse Check's engagement rollup), same "today/a bounded window, or
// cached" standard the Ops console already sets (D48). Nothing here
// returns, or is computed from, any single learner's identity - nothing in
// this file selects a name, email, or user id.
export async function getAdminAnalyticsSummary(): Promise<AdminAnalyticsSummary> {
  return getOrSetJsonCache(
    "analytics:admin-summary",
    ANALYTICS_SUMMARY_CACHE_TTL_SECONDS,
    async () => {
      const now = new Date();
      const todayStartUtc = istDateStartUtc(now);
      const sevenDaysAgoUtc = new Date(now.getTime() - 7 * DAYS_MS);
      const thirtyDaysAgoUtc = new Date(now.getTime() - 30 * DAYS_MS);
      const todayIst = istDateString(now);
      const sevenDaysAgoIst = istDateString(sevenDaysAgoUtc);
      const thirtyDaysAgoIst = istDateString(thirtyDaysAgoUtc);

      const [
        totalActive,
        newToday,
        newLast7Days,
        dau,
        wau,
        mau,
        completedToday,
        completedLast7Days,
        activeTradersToday,
        ordersToday,
        pulseCheckEngagement,
        activeAdFreeEntitlements,
        purchaseEventTypesLast7Days,
      ] = await runWithConcurrencyLimit(
        [
          () => countTotalActiveUsers(),
          () => countNewUsersSince(todayStartUtc),
          () => countNewUsersSince(sevenDaysAgoUtc),
          () => countDistinctActiveUsersSinceIstDate(todayIst),
          () => countDistinctActiveUsersSinceIstDate(sevenDaysAgoIst),
          () => countDistinctActiveUsersSinceIstDate(thirtyDaysAgoIst),
          () => countLessonsCompletedSince(todayStartUtc),
          () => countLessonsCompletedSince(sevenDaysAgoUtc),
          () => countActiveTradersToday(todayStartUtc),
          () => countOrdersToday(todayStartUtc),
          () => getPulseCheckEngagement(7, now),
          () => countActiveAdFreeEntitlements(now),
          () => listEntitlementUpdateEventTypesSince(sevenDaysAgoUtc),
        ],
        DB_CONCURRENCY_LIMIT,
      );

      return {
        users: { totalActive, newToday, newLast7Days },
        retention: { dau, wau, mau },
        lessons: { completedToday, completedLast7Days },
        trading: { activeTradersToday, ordersToday },
        news: {
          pulseCheckEngagementPct7Day: pulseCheckEngagement.averagePct,
          pulseCheckActiveUsers: pulseCheckEngagement.activeUserCount,
        },
        revenue: {
          activeAdFreeEntitlements,
          newPurchasesLast7Days: purchaseEventTypesLast7Days.filter((t) =>
            PURCHASE_EVENT_TYPES.has(t),
          ).length,
        },
      };
    },
  );
}
