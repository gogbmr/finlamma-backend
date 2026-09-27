import { logActivity } from "@/lib/activity-log";
import type { requestMeta } from "@/lib/http";
import { istDateStartUtc } from "@/lib/ist-date";
import { getOrSetJsonCache } from "@/lib/redis";
import { getSettingJson, setSettingJson } from "@/lib/settings";
import { getCachedQuote } from "@/server/market/cache";
import { getLatestNav } from "@/server/funds/repo";
import { getInstrumentsByIds } from "@/server/trading/repo";
import {
  countActiveTradersToday,
  countOrdersToday,
  countOrdersTodayForUsers,
  getUsersByIds,
  listHoldingsForUsers,
  listRecentOpsEvents,
  listTradingActiveUserIdsSorted,
  sumRealizedPnlForUsers,
  sumVmoneyBalancesForUsers,
  sumVmoneyInPlay,
  type FundHoldingRow,
  type LedgerUserRow,
  type StockHoldingRow,
} from "./repo";
import {
  DEFAULT_RISK_THRESHOLDS,
  RISK_THRESHOLDS_SETTINGS_KEY,
  RiskThresholdsSchema,
  type RiskFlag,
  type RiskThresholds,
} from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;

// Cheap in-memory caches within one computation - the actual DB/Redis
// lookups behind getRiskThresholds/listTradingActiveUserIdsSorted are
// already cached at their own layer (getOrSetJsonCache), so calling these
// helpers more than once per request is not a second round trip in
// practice, just a convenience.

export async function getRiskThresholds(): Promise<RiskThresholds> {
  const raw = await getSettingJson(RISK_THRESHOLDS_SETTINGS_KEY);
  if (raw === null) return DEFAULT_RISK_THRESHOLDS;
  const parsed = RiskThresholdsSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_RISK_THRESHOLDS;
}

export async function updateRiskThresholds(
  actor: { id: string },
  input: RiskThresholds,
  meta: RequestMeta,
): Promise<RiskThresholds> {
  const previous = await getRiskThresholds();
  await setSettingJson(
    RISK_THRESHOLDS_SETTINGS_KEY,
    input,
    "Ops console risk-flag thresholds (NEW account age, WATCH concentration %, WATCH daily order count) - docs/ARCHITECTURE.md D48.",
  );
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "ops.risk_thresholds_updated",
    targetType: "settings_kv",
    targetId: RISK_THRESHOLDS_SETTINGS_KEY,
    metadata: { previous, next: input },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return input;
}

// The exact rule stated to the founder: NEW = joined < newAccountDays ago;
// WATCH = concentration or order-count over threshold; OK = otherwise.
// NEW takes priority over WATCH deliberately - a brand-new account's very
// first trade is naturally ~100% concentrated in one position (they've
// only ever bought one thing), so if WATCH could still fire for a NEW
// account, every single first-time trader would show WATCH, making the
// flag meaningless noise instead of a real signal. A flag is a prompt to
// look, never an accusation - see the Ops console UI copy.
export function computeRiskFlag(
  accountAgeDays: number,
  concentrationPct: number,
  ordersToday: number,
  thresholds: RiskThresholds,
): RiskFlag {
  if (accountAgeDays < thresholds.newAccountDays) return "new";
  if (concentrationPct > thresholds.concentrationPct || ordersToday > thresholds.dailyOrderCount) return "watch";
  return "ok";
}

export type LedgerRow = {
  userId: string;
  displayName: string;
  joinedAt: string;
  balancePaise: number;
  totalPnlPaise: number;
  concentrationPct: number;
  ordersToday: number;
  flag: RiskFlag;
};

function roundPct(value: number): number {
  return Math.round(value * 100) / 100;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// The one function every "who's the biggest position, what's the account
// worth right now" computation goes through - called with a single page of
// user ids for the paginated ledger, and with the FULL trading-active
// population (cached separately, longer TTL) for the KPI tile's risk-flags
// count. Either way: exactly one grouped query per aggregate (never one
// per user) and exactly one price lookup per DISTINCT instrument/fund held
// across the whole input set (never one per user per holding) - this is
// what keeps the cost bounded by "how many distinct things are held right
// now", not by how many users or how much order history exists
// (docs/ARCHITECTURE.md D48).
async function computeLedgerRows(userIds: string[], thresholds: RiskThresholds, now: Date): Promise<LedgerRow[]> {
  if (userIds.length === 0) return [];

  const todayStartUtc = istDateStartUtc(now);
  const [userRows, balances, ordersTodayCounts, holdingsData, realizedPnl] = await Promise.all([
    getUsersByIds(userIds),
    sumVmoneyBalancesForUsers(userIds),
    countOrdersTodayForUsers(userIds, todayStartUtc),
    listHoldingsForUsers(userIds),
    sumRealizedPnlForUsers(userIds),
  ]);

  const instrumentIds = Array.from(new Set(holdingsData.stock.map((h) => h.instrumentId)));
  const fundIds = Array.from(new Set(holdingsData.fund.map((h) => h.fundId)));

  const instruments = await getInstrumentsByIds(instrumentIds);
  const [stockQuotes, fundNavs] = await Promise.all([
    Promise.allSettled(instruments.map((i) => getCachedQuote(i.symbol, i.exchange))),
    Promise.allSettled(fundIds.map((id) => getLatestNav(id))),
  ]);

  const priceByInstrumentId = new Map<string, number>();
  instruments.forEach((inst, i) => {
    const result = stockQuotes[i];
    if (result?.status === "fulfilled" && result.value) priceByInstrumentId.set(inst.id, result.value.pricePaise);
  });
  const navByFundId = new Map<string, number>();
  fundIds.forEach((fundId, i) => {
    const result = fundNavs[i];
    if (result?.status === "fulfilled" && result.value) navByFundId.set(fundId, result.value.navPaise);
  });

  const stockByUser = new Map<string, StockHoldingRow[]>();
  for (const h of holdingsData.stock) {
    const arr = stockByUser.get(h.userId) ?? [];
    arr.push(h);
    stockByUser.set(h.userId, arr);
  }
  const fundByUser = new Map<string, FundHoldingRow[]>();
  for (const h of holdingsData.fund) {
    const arr = fundByUser.get(h.userId) ?? [];
    arr.push(h);
    fundByUser.set(h.userId, arr);
  }

  function shapeRow(user: LedgerUserRow): LedgerRow {
    const balancePaise = balances.get(user.id) ?? 0;
    let holdingsValuePaise = 0;
    let unrealizedPnlPaise = 0;
    let largestPositionPaise = 0;

    for (const h of stockByUser.get(user.id) ?? []) {
      // Falls back to the position's own average cost if no live quote is
      // available right now - same "never block on a missing quote"
      // reasoning as the Trade tab's own display paths, just for an
      // internal dashboard instead.
      const price = priceByInstrumentId.get(h.instrumentId) ?? h.avgPricePaise;
      const value = h.qty * price;
      holdingsValuePaise += value;
      unrealizedPnlPaise += h.qty * (price - h.avgPricePaise);
      if (value > largestPositionPaise) largestPositionPaise = value;
    }
    for (const h of fundByUser.get(user.id) ?? []) {
      const nav = navByFundId.get(h.fundId) ?? h.avgNavPaise;
      const value = Math.round((h.unitsMilli * nav) / 1000);
      holdingsValuePaise += value;
      unrealizedPnlPaise += Math.round((h.unitsMilli * (nav - h.avgNavPaise)) / 1000);
      if (value > largestPositionPaise) largestPositionPaise = value;
    }

    const totalAccountValuePaise = balancePaise + holdingsValuePaise;
    const concentrationPct = totalAccountValuePaise > 0 ? (largestPositionPaise / totalAccountValuePaise) * 100 : 0;
    const ordersToday = ordersTodayCounts.get(user.id) ?? 0;
    const totalPnlPaise = (realizedPnl.get(user.id) ?? 0) + unrealizedPnlPaise;
    const accountAgeDays = Math.floor((now.getTime() - user.createdAt.getTime()) / MS_PER_DAY);

    return {
      userId: user.id,
      displayName: user.lastInitial ? `${user.firstName ?? "—"} ${user.lastInitial}.` : (user.firstName ?? "—"),
      joinedAt: user.createdAt.toISOString(),
      balancePaise,
      totalPnlPaise,
      concentrationPct: roundPct(concentrationPct),
      ordersToday,
      flag: computeRiskFlag(accountAgeDays, concentrationPct, ordersToday, thresholds),
    };
  }

  return userRows.map(shapeRow);
}

const TRADING_ACTIVE_IDS_CACHE_TTL_SECONDS = 60;
const OPS_KPIS_CACHE_TTL_SECONDS = 60;
const LEDGER_PAGE_SIZE_DEFAULT = 20;

async function getCachedTradingActiveUserIds(): Promise<string[]> {
  return getOrSetJsonCache("ops:trading-active-user-ids", TRADING_ACTIVE_IDS_CACHE_TTL_SECONDS, () =>
    listTradingActiveUserIdsSorted(),
  );
}

export type OpsKpis = {
  activeTradersToday: number;
  ordersToday: number;
  vmoneyInPlayPaise: number;
  riskFlagsCount: number;
};

// Every number here is either scoped to TODAY (IST) or cached - see the
// per-field comments in src/server/ops/repo.ts. riskFlagsCount reuses the
// exact same batched computation the paginated ledger uses, just over the
// FULL trading-active population instead of one page - genuinely O(active
// traders), not O(all signups) or O(all-time order volume), and cached
// here on top so repeated dashboard views don't recompute it
// (docs/ARCHITECTURE.md D48).
export async function getOpsKpis(): Promise<OpsKpis> {
  return getOrSetJsonCache("ops:kpis", OPS_KPIS_CACHE_TTL_SECONDS, async () => {
    const now = new Date();
    const todayStartUtc = istDateStartUtc(now);
    const [activeTradersToday, ordersToday, tradingActiveUserIds, thresholds] = await Promise.all([
      countActiveTradersToday(todayStartUtc),
      countOrdersToday(todayStartUtc),
      getCachedTradingActiveUserIds(),
      getRiskThresholds(),
    ]);
    const [vmoneyInPlayPaise, rows] = await Promise.all([
      sumVmoneyInPlay(tradingActiveUserIds),
      computeLedgerRows(tradingActiveUserIds, thresholds, now),
    ]);
    return {
      activeTradersToday,
      ordersToday,
      vmoneyInPlayPaise,
      riskFlagsCount: rows.filter((r) => r.flag !== "ok").length,
    };
  });
}

// The User Trading Ledger (TR-51) - trading.ops gated (checked by the
// caller), every view logged (founder's requirement, same treatment as a
// consent PII reveal) with exactly which learners' rows were shown. Cursor
// is the last userId on the previous page (ids are sorted ascending, so
// "> cursor" is a correct, stable continuation).
export async function getUserTradingLedgerPage(
  actor: { id: string },
  opts: { limit?: number; cursor?: string | null },
  meta: RequestMeta,
): Promise<{ data: LedgerRow[]; nextCursor: string | null }> {
  const limit = opts.limit ?? LEDGER_PAGE_SIZE_DEFAULT;
  const allIds = await getCachedTradingActiveUserIds();
  const candidateIds = opts.cursor ? allIds.filter((id) => id > opts.cursor!) : allIds;
  const pageIds = candidateIds.slice(0, limit);
  const hasMore = candidateIds.length > limit;

  const thresholds = await getRiskThresholds();
  const rows = await computeLedgerRows(pageIds, thresholds, new Date());

  if (pageIds.length > 0) {
    await logActivity({
      actorType: "staff",
      actorId: actor.id,
      action: "ops.user_ledger_viewed",
      targetType: "trading_ledger",
      targetId: null,
      metadata: { viewedUserIds: pageIds, count: pageIds.length },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  return { data: rows, nextCursor: hasMore ? (pageIds.at(-1) ?? null) : null };
}

const RECENT_EVENTS_LIMIT = 20;

// Audit Log panel - a read-only view of the same activity_logs rows
// src/server/trading/service.ts's halt/feed-mode/symbol-halt functions and
// updateRiskThresholds above already write, so there's no separate log
// table to keep in sync (docs/ARCHITECTURE.md D48).
export async function getRecentOpsEvents() {
  return listRecentOpsEvents(RECENT_EVENTS_LIMIT);
}
