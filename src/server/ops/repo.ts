import { and, desc, eq, gte, inArray, like, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { activityLogs, fundHoldings, fundOrders, holdings, orders, users, vmoneyLedger } from "@/db/schema";

function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

// --- Trading-active user population ---
// "Trading-active" = has ever placed a stock or fund order. Everything in
// this file is scoped to this set, not the whole `users` table - most
// learners never reach the trading unlock at all, so the Ops console's
// queries stay bounded by how many people actually trade, not by total
// signups (docs/ARCHITECTURE.md D48).

// Two cheap, separately-indexed DISTINCT scans, merged in JS - bounded by
// the number of distinct trading users, not by total order-row volume.
// Cached briefly by the service layer (getOrSetJsonCache) since this is
// still O(distinct trading users) per call and an Ops dashboard may poll.
export async function listTradingActiveUserIdsSorted(): Promise<string[]> {
  const [stockUsers, fundUsers] = await Promise.all([
    db.selectDistinct({ userId: orders.userId }).from(orders),
    db.selectDistinct({ userId: fundOrders.userId }).from(fundOrders),
  ]);
  const ids = new Set<string>();
  for (const row of stockUsers) ids.add(row.userId);
  for (const row of fundUsers) ids.add(row.userId);
  return Array.from(ids).sort();
}

export type LedgerUserRow = {
  id: string;
  firstName: string | null;
  lastInitial: string | null;
  createdAt: Date;
};

export async function getUsersByIds(userIds: string[]): Promise<LedgerUserRow[]> {
  if (userIds.length === 0) return [];
  return db
    .select({ id: users.id, firstName: users.firstName, lastInitial: users.lastInitial, createdAt: users.createdAt })
    .from(users)
    .where(inArray(users.id, userIds));
}

// --- Per-user aggregates, always ONE grouped query per page (never one
// query per user) - this is what keeps the ledger's cost proportional to
// page size, not to how many trading-active users exist overall. ---

export async function sumVmoneyBalancesForUsers(userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ userId: vmoneyLedger.userId, total: sql<string | number>`coalesce(sum(${vmoneyLedger.amountPaise}), 0)` })
    .from(vmoneyLedger)
    .where(inArray(vmoneyLedger.userId, userIds))
    .groupBy(vmoneyLedger.userId);
  return new Map(rows.map((r) => [r.userId, toNumber(r.total)]));
}

// Stock + fund orders combined, today (IST) only - `todayStartUtc` is the
// UTC instant of IST midnight (src/lib/ist-date.ts's istDateStartUtc), so
// this stays a cheap indexed range scan regardless of total order history.
export async function countOrdersTodayForUsers(userIds: string[], todayStartUtc: Date): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const [stockRows, fundRows] = await Promise.all([
    db
      .select({ userId: orders.userId, count: sql<string | number>`count(*)` })
      .from(orders)
      .where(and(inArray(orders.userId, userIds), gte(orders.createdAt, todayStartUtc)))
      .groupBy(orders.userId),
    db
      .select({ userId: fundOrders.userId, count: sql<string | number>`count(*)` })
      .from(fundOrders)
      .where(and(inArray(fundOrders.userId, userIds), gte(fundOrders.createdAt, todayStartUtc)))
      .groupBy(fundOrders.userId),
  ]);
  const map = new Map<string, number>();
  for (const r of stockRows) map.set(r.userId, (map.get(r.userId) ?? 0) + toNumber(r.count));
  for (const r of fundRows) map.set(r.userId, (map.get(r.userId) ?? 0) + toNumber(r.count));
  return map;
}

// Stock + fund SELL fills combined, all-time - the same realizedPnlPaise
// columns D43/D46 already populate at fill time, just summed per user.
export async function sumRealizedPnlForUsers(userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const [stockRows, fundRows] = await Promise.all([
    db
      .select({ userId: orders.userId, total: sql<string | number>`coalesce(sum(${orders.realizedPnlPaise}), 0)` })
      .from(orders)
      .where(and(inArray(orders.userId, userIds), eq(orders.side, "sell"), eq(orders.status, "filled")))
      .groupBy(orders.userId),
    db
      .select({ userId: fundOrders.userId, total: sql<string | number>`coalesce(sum(${fundOrders.realizedPnlPaise}), 0)` })
      .from(fundOrders)
      .where(and(inArray(fundOrders.userId, userIds), eq(fundOrders.side, "sell"), eq(fundOrders.status, "filled")))
      .groupBy(fundOrders.userId),
  ]);
  const map = new Map<string, number>();
  for (const r of stockRows) map.set(r.userId, (map.get(r.userId) ?? 0) + toNumber(r.total));
  for (const r of fundRows) map.set(r.userId, (map.get(r.userId) ?? 0) + toNumber(r.total));
  return map;
}

export type StockHoldingRow = { userId: string; instrumentId: string; qty: number; avgPricePaise: number };
export type FundHoldingRow = { userId: string; fundId: string; unitsMilli: number; avgNavPaise: number };

export async function listHoldingsForUsers(
  userIds: string[],
): Promise<{ stock: StockHoldingRow[]; fund: FundHoldingRow[] }> {
  if (userIds.length === 0) return { stock: [], fund: [] };
  const [stockRows, fundRows] = await Promise.all([
    db
      .select({ userId: holdings.userId, instrumentId: holdings.instrumentId, qty: holdings.qty, avgPricePaise: holdings.avgPricePaise })
      .from(holdings)
      .where(and(inArray(holdings.userId, userIds), sql`${holdings.qty} > 0`)),
    db
      .select({ userId: fundHoldings.userId, fundId: fundHoldings.fundId, unitsMilli: fundHoldings.unitsMilli, avgNavPaise: fundHoldings.avgNavPaise })
      .from(fundHoldings)
      .where(and(inArray(fundHoldings.userId, userIds), sql`${fundHoldings.unitsMilli} > 0`)),
  ]);
  return { stock: stockRows, fund: fundRows };
}

// --- KPI tiles (Ops console) - all scoped to TODAY (IST) or to the
// trading-active population, never a full-table scan that grows unbounded
// with total historical data (docs/ARCHITECTURE.md D48). ---

export async function countActiveTradersToday(todayStartUtc: Date): Promise<number> {
  const [stockRows, fundRows] = await Promise.all([
    db.selectDistinct({ userId: orders.userId }).from(orders).where(gte(orders.createdAt, todayStartUtc)),
    db.selectDistinct({ userId: fundOrders.userId }).from(fundOrders).where(gte(fundOrders.createdAt, todayStartUtc)),
  ]);
  const ids = new Set<string>();
  for (const r of stockRows) ids.add(r.userId);
  for (const r of fundRows) ids.add(r.userId);
  return ids.size;
}

export async function countOrdersToday(todayStartUtc: Date): Promise<number> {
  const [[stockRow], [fundRow]] = await Promise.all([
    db.select({ count: sql<string | number>`count(*)` }).from(orders).where(gte(orders.createdAt, todayStartUtc)),
    db.select({ count: sql<string | number>`count(*)` }).from(fundOrders).where(gte(fundOrders.createdAt, todayStartUtc)),
  ]);
  return toNumber(stockRow?.count ?? 0) + toNumber(fundRow?.count ?? 0);
}

// --- Audit log panel (Ops console) ---

// Every dangerous-control action logs with action starting "ops." (halt,
// feed-mode, risk-threshold changes) or targetType "instrument"/"fund"
// (per-symbol/fund halts share the "ops."-prefixed action too - see
// src/server/trading/service.ts) - a simple LIKE filter over the
// already-indexed, already-small activity_logs table, bounded by LIMIT,
// never a full scan.
export async function listRecentOpsEvents(limit: number) {
  return db
    .select()
    .from(activityLogs)
    .where(or(like(activityLogs.action, "ops.%"), eq(activityLogs.targetType, "market_controls")))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);
}

// Total V Money currently held by the trading-active population only (not
// the whole platform's economy) - the one KPI that's inherently a sum
// over historical rows rather than a "today" window, so it's the one most
// worth caching (src/server/ops/service.ts) rather than bounding further.
export async function sumVmoneyInPlay(tradingActiveUserIds: string[]): Promise<number> {
  if (tradingActiveUserIds.length === 0) return 0;
  const [row] = await db
    .select({ total: sql<string | number>`coalesce(sum(${vmoneyLedger.amountPaise}), 0)` })
    .from(vmoneyLedger)
    .where(inArray(vmoneyLedger.userId, tradingActiveUserIds));
  return toNumber(row?.total ?? 0);
}
