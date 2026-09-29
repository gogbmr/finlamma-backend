import { db } from "@/db/client";
import { AppError } from "@/lib/errors";
import { logActivity } from "@/lib/activity-log";
import type { requestMeta } from "@/lib/http";
import { checkRateLimit, TRADE_ORDER_RATE_LIMIT } from "@/lib/redis";
import { getSettingNumber, setSettingJson } from "@/lib/settings";
import { getDisplayNamesForUserIds } from "@/server/arena/repo";
import { insertVmoneyLedgerEntryIfNew } from "@/server/economy/repo";
import { VM_TO_LEDGER_PAISE } from "@/server/economy/schemas";
import { getVmIssuanceMultiplier } from "@/server/economy/service";
import { insertUserBadgeIfAbsent } from "@/server/badges/repo";
import { getInstrumentById } from "@/server/trading/repo";
import { getRelayPrice } from "@/server/trading/relay-price";
import { isTradingUnlocked } from "@/server/worlds/service";
import {
  claimCompetitionForSettlement,
  countTradesForEntries,
  countTradesForEntry,
  getCompetitionById,
  getCurrentCompetition,
  getEntry,
  getPrizeForUser,
  insertCompetitionPrizeIfNew,
  insertDraftCompetition,
  insertEntryIfNew,
  listCompetitionsForAdmin,
  listEntriesForCompetition,
  listPublishedCompetitionsPastWindowEnd,
  placeCompetitionTradeTx,
  publishCompetitionRow,
  updateDraftCompetition,
  type CompetitionDraftInput,
  type CompetitionEntryRow,
  type CompetitionRow,
} from "./repo";

type RequestMeta = ReturnType<typeof requestMeta>;

// --- Settings (docs/ARCHITECTURE.md D58/D59) ---

export const COMPETITION_MIN_QUALIFYING_TRADES_KEY = "competition_min_qualifying_trades";
export const DEFAULT_COMPETITION_MIN_QUALIFYING_TRADES = 5;
export const COMPETITION_MAX_TRADES_KEY = "competition_max_trades";
export const DEFAULT_COMPETITION_MAX_TRADES = 10;
export const COMPETITION_ENTRY_WINDOW_PCT_KEY = "competition_entry_window_pct";
export const DEFAULT_COMPETITION_ENTRY_WINDOW_PCT = 50;

export async function getCompetitionSettingsForAdmin() {
  const [minQualifyingTrades, maxTrades, entryWindowPct] = await Promise.all([
    getSettingNumber(COMPETITION_MIN_QUALIFYING_TRADES_KEY, DEFAULT_COMPETITION_MIN_QUALIFYING_TRADES),
    getSettingNumber(COMPETITION_MAX_TRADES_KEY, DEFAULT_COMPETITION_MAX_TRADES),
    getSettingNumber(COMPETITION_ENTRY_WINDOW_PCT_KEY, DEFAULT_COMPETITION_ENTRY_WINDOW_PCT),
  ]);
  return { minQualifyingTrades, maxTrades, entryWindowPct };
}

export async function updateCompetitionSettingsForAdmin(
  actor: { id: string },
  input: { minQualifyingTrades: number; maxTrades: number; entryWindowPct: number },
  meta: RequestMeta,
) {
  const previous = await getCompetitionSettingsForAdmin();
  await Promise.all([
    setSettingJson(
      COMPETITION_MIN_QUALIFYING_TRADES_KEY,
      input.minQualifyingTrades,
      "Competition: minimum trades to qualify for ranking/prizes (D59)",
    ),
    setSettingJson(COMPETITION_MAX_TRADES_KEY, input.maxTrades, "Competition: maximum trades allowed per entry"),
    setSettingJson(
      COMPETITION_ENTRY_WINDOW_PCT_KEY,
      input.entryWindowPct,
      "Competition: entries only accepted within the first N% of the window (D59)",
    ),
  ]);
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "competitions.settings_updated",
    targetType: "settings_kv",
    targetId: "competition_settings",
    metadata: { previous, next: input },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return input;
}

// --- Ranking (shared by live views and settlement) ---

export type RankedEntry = {
  userId: string;
  entryId: string;
  rank: number;
  endingValuePaise: number;
  roiPctBasisPoints: number;
};

// Pure - the SAME formula for a live "You" card, a live leaderboard, and a
// final settlement, just fed a different `currentPricePaise` (a live relay
// tick vs. the last known price at settlement). ROI is computed against the
// FULL starting capital, never the cost basis of whatever was actually
// deployed (docs/ARCHITECTURE.md D59's anti-gaming note) - a learner who
// buys one cheap share with a sliver of their capital and it doubles only
// moves the needle by a tiny fraction, since the rest of the capital sat in
// cash earning exactly 0%. Sorted by endingValuePaise descending, which is
// equivalent to sorting by ROI% since every entry shares the same starting
// capital.
export function rankEntriesByRoi(
  entries: { userId: string; id: string; cashPaise: number; qtyHeld: number }[],
  currentPricePaise: number,
  virtualCapitalPaise: number,
): RankedEntry[] {
  return entries
    .map((e) => {
      const endingValuePaise = e.cashPaise + e.qtyHeld * currentPricePaise;
      const roiPctBasisPoints = Math.round(((endingValuePaise - virtualCapitalPaise) / virtualCapitalPaise) * 10000);
      return { userId: e.userId, entryId: e.id, endingValuePaise, roiPctBasisPoints };
    })
    .sort((a, b) => b.endingValuePaise - a.endingValuePaise)
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

// --- Learner-facing views ---

export type CurrentCompetitionView = {
  id: string;
  name: { en: string; hi: string; hx: string };
  instrumentId: string;
  virtualCapitalPaise: number;
  windowStart: string;
  windowEnd: string;
  daysLeft: number;
  prizes: CompetitionRow["prizes"];
  rules: { en: string; hi: string; hx: string };
  playersCount: number;
};

// AR-14's hero card, minus live LTP/%-change - the app already has a
// dedicated instrument-quote endpoint (GET /trade/instruments/{symbol}) for
// that, so this doesn't duplicate a live market-data fetch just for display.
export async function getCurrentCompetitionView(now: Date = new Date()): Promise<CurrentCompetitionView | null> {
  const competition = await getCurrentCompetition(now);
  if (!competition) return null;
  const entries = await listEntriesForCompetition(competition.id);
  return {
    id: competition.id,
    name: competition.name,
    instrumentId: competition.instrumentId,
    virtualCapitalPaise: competition.virtualCapitalPaise,
    windowStart: competition.windowStart.toISOString(),
    windowEnd: competition.windowEnd.toISOString(),
    daysLeft: Math.max(0, Math.ceil((competition.windowEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))),
    prizes: competition.prizes,
    rules: competition.rules,
    playersCount: entries.length,
  };
}

function entryWindowDeadline(competition: CompetitionRow, entryWindowPct: number): Date {
  const spanMs = competition.windowEnd.getTime() - competition.windowStart.getTime();
  return new Date(competition.windowStart.getTime() + spanMs * (entryWindowPct / 100));
}

// AR-14's entry action. Idempotent-ish rather than an error on a repeat call
// (docs/ARCHITECTURE.md D59's entry-window check only matters the FIRST
// time) - a learner who's already entered just gets their existing entry
// back, never a second one (competition_entries' own unique index is what
// actually prevents a second entry, not this check).
export async function enterCurrentCompetition(
  user: { id: string },
  meta: RequestMeta,
  now: Date = new Date(),
): Promise<CompetitionEntryRow> {
  const competition = await getCurrentCompetition(now);
  if (!competition) throw new AppError("NOT_FOUND", "No active competition right now");

  const existing = await getEntry(competition.id, user.id);
  if (existing) return existing;

  if (!(await isTradingUnlocked(user.id))) {
    throw new AppError("FORBIDDEN", "Trading is locked until you clear more worlds");
  }

  const entryWindowPct = await getSettingNumber(COMPETITION_ENTRY_WINDOW_PCT_KEY, DEFAULT_COMPETITION_ENTRY_WINDOW_PCT);
  if (now > entryWindowDeadline(competition, entryWindowPct)) {
    throw new AppError("COMPETITION_ENTRY_CLOSED", "Entry for this competition has closed");
  }

  const entry = await insertEntryIfNew(competition.id, user.id, competition.virtualCapitalPaise);
  if (!entry) {
    // Lost a create race against a concurrent request - the other request's
    // row is the real one, this is a safe re-read, not an error.
    const raced = await getEntry(competition.id, user.id);
    if (raced) return raced;
    throw new AppError("COMPETITION_ENTRY_CLOSED", "Could not enter this competition");
  }

  await logActivity({
    actorType: "user",
    actorId: user.id,
    action: "competitions.entered",
    targetType: "competitions",
    targetId: competition.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return entry;
}

export type CompetitionTradeInput = { side: "buy" | "sell"; qty: number };

// AR-14's order action, inside the isolated sandbox. Rate-limited the same
// way real orders are (D49's own reasoning: this "spends" a balance, even
// though it's never real VM) - failOpen: false, same as TRADE_ORDER_RATE_LIMIT's
// existing real-money usage.
export async function placeCompetitionTrade(
  user: { id: string },
  input: CompetitionTradeInput,
  idempotencyKey: string,
  meta: RequestMeta,
  now: Date = new Date(),
) {
  const { allowed } = await checkRateLimit(user.id, TRADE_ORDER_RATE_LIMIT, false);
  if (!allowed) {
    throw new AppError("RATE_LIMITED", "Too many order attempts - slow down and try again shortly");
  }

  const competition = await getCurrentCompetition(now);
  if (!competition) throw new AppError("NOT_FOUND", "No active competition right now");

  const entry = await getEntry(competition.id, user.id);
  if (!entry) throw new AppError("FORBIDDEN", "Enter the competition before trading in it");

  const instrument = await getInstrumentById(competition.instrumentId);
  if (!instrument) throw new AppError("NOT_FOUND", "Competition instrument not found");

  const maxTrades = await getSettingNumber(COMPETITION_MAX_TRADES_KEY, DEFAULT_COMPETITION_MAX_TRADES);
  const result = await placeCompetitionTradeTx(entry.id, instrument, input, idempotencyKey, maxTrades, now);

  switch (result.status) {
    case "idempotency_conflict":
      throw new AppError("IDEMPOTENCY_REPLAY", "This Idempotency-Key was already used for a different request");
    case "market_halted":
      throw new AppError("MARKET_HALTED", "Trading is halted right now");
    case "symbol_halted":
      throw new AppError("SYMBOL_HALTED", "This stock is halted right now");
    case "market_paused":
      throw new AppError("MARKET_PAUSED", "The market feed is paused right now");
    case "market_closed":
      throw new AppError("MARKET_CLOSED", "The market is closed right now");
    case "max_trades_reached":
      throw new AppError("COMPETITION_MAX_TRADES_REACHED", `You've reached the ${maxTrades}-trade limit for this competition`);
    case "price_unavailable":
      throw new AppError("PRICE_UNAVAILABLE", "No price data available right now");
    case "price_stale":
      throw new AppError("PRICE_STALE", "The price is too old right now - try again shortly");
    case "insufficient_cash":
      throw new AppError("INSUFFICIENT_MARGIN", "Not enough competition cash for this order", {
        cashPaise: result.cashPaise,
        requiredPaise: result.requiredPaise,
      });
    case "insufficient_holdings":
      throw new AppError("INSUFFICIENT_HOLDINGS", "You don't hold enough shares for this sale", {
        heldQty: result.heldQty,
        requestedQty: result.requestedQty,
      });
    case "replayed":
      return { ...result.trade, replayed: true };
    case "filled":
      await logActivity({
        actorType: "user",
        actorId: user.id,
        action: "competitions.trade_filled",
        targetType: "competition_trades",
        targetId: result.trade.id,
        metadata: { side: input.side, qty: input.qty, fillPricePaise: result.trade.fillPricePaise },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return { ...result.trade, replayed: false };
  }
}

export type MyCompetitionStatus =
  | { entered: false }
  | {
      entered: true;
      rank: number;
      poolSize: number;
      roiPctBasisPoints: number;
      tradeCount: number;
      cashPaise: number;
      qtyHeld: number;
    };

// AR-15's "You" rank card - live, computed the instant it's requested, never
// cached against a snapshot (unlike Arena's weekly-settled percentile,
// docs/ARCHITECTURE.md D55's snapshot design) since a competition is a
// single ongoing event, not a recurring weekly cycle.
export async function getMyCompetitionStatus(user: { id: string }, now: Date = new Date()): Promise<MyCompetitionStatus | null> {
  const competition = await getCurrentCompetition(now);
  if (!competition) return null;

  const entry = await getEntry(competition.id, user.id);
  if (!entry) return { entered: false };

  const instrument = await getInstrumentById(competition.instrumentId);
  const price = instrument ? await getRelayPrice(instrument.symbol, instrument.exchange) : null;
  const currentPricePaise = price?.pricePaise ?? entry.avgPricePaise; // last-known fallback if the relay has nothing right now

  const allEntries = await listEntriesForCompetition(competition.id);
  const ranked = rankEntriesByRoi(allEntries, currentPricePaise, competition.virtualCapitalPaise);
  const mine = ranked.find((r) => r.userId === user.id)!;
  const tradeCount = await countTradesForEntry(entry.id);

  return {
    entered: true,
    rank: mine.rank,
    poolSize: ranked.length,
    roiPctBasisPoints: mine.roiPctBasisPoints,
    tradeCount,
    cashPaise: entry.cashPaise,
    qtyHeld: entry.qtyHeld,
  };
}

export type CompetitionLeaderboardRow = {
  rank: number;
  userId: string;
  firstName: string | null;
  lastInitial: string | null;
  roiPctBasisPoints: number;
  isSelf: boolean;
};

const COMPETITION_LEADERBOARD_LIMIT = 50;

// AR-16's ranked board - same top-N + self-outside-the-window shape Arena's
// own leaderboard already established (src/server/arena/service.ts). Row
// expansion (best trade, win rate, avg hold time) is a fast-follow, not
// built this checkpoint - same "ship the base ladder first" precedent
// Phase 6 Checkpoint 2 already set for the Worlds/Players ladders' own
// AR-10 row expansion.
export async function getCompetitionLeaderboard(
  user: { id: string },
  now: Date = new Date(),
): Promise<{ rows: CompetitionLeaderboardRow[]; poolSize: number } | null> {
  const competition = await getCurrentCompetition(now);
  if (!competition) return null;

  const instrument = await getInstrumentById(competition.instrumentId);
  const price = instrument ? await getRelayPrice(instrument.symbol, instrument.exchange) : null;

  const allEntries = await listEntriesForCompetition(competition.id);
  if (allEntries.length === 0) return { rows: [], poolSize: 0 };

  const currentPricePaise = price?.pricePaise ?? allEntries[0]!.avgPricePaise;
  const ranked = rankEntriesByRoi(allEntries, currentPricePaise, competition.virtualCapitalPaise);
  const names = await getDisplayNamesForUserIds(ranked.map((r) => r.userId));

  const top = ranked.slice(0, COMPETITION_LEADERBOARD_LIMIT);
  const selfInTop = top.some((r) => r.userId === user.id);
  const mine = ranked.find((r) => r.userId === user.id);

  const rows: CompetitionLeaderboardRow[] = top.map((r) => {
    const name = names.get(r.userId);
    return {
      rank: r.rank,
      userId: r.userId,
      firstName: name?.firstName ?? null,
      lastInitial: name?.lastInitial ?? null,
      roiPctBasisPoints: r.roiPctBasisPoints,
      isSelf: r.userId === user.id,
    };
  });

  if (mine && !selfInTop) {
    const name = names.get(mine.userId);
    rows.push({
      rank: mine.rank,
      userId: mine.userId,
      firstName: name?.firstName ?? null,
      lastInitial: name?.lastInitial ?? null,
      roiPctBasisPoints: mine.roiPctBasisPoints,
      isSelf: true,
    });
  }

  return { rows, poolSize: ranked.length };
}

// --- Settlement ---

// Runs daily (src/inngest/functions/competition-settlement.ts): finds every
// published competition whose window ended in the past and hasn't settled
// yet, and settles each independently - one competition's failure (e.g. no
// price data available at all) never blocks another's, and simply retries
// on the next day's sweep (the outer `claimCompetitionForSettlement` gate
// means a competition that fails AFTER being claimed stays claimed - see
// that function's own comment for why this is an accepted, documented
// tradeoff, same as CP3's league settlement).
export async function settleDueCompetitions(now: Date = new Date()): Promise<{ settled: number; skipped: number }> {
  const due = await listPublishedCompetitionsPastWindowEnd(now);
  let settled = 0;
  let skipped = 0;
  for (const competition of due) {
    const didSettle = await settleOneCompetition(competition.id, now);
    if (didSettle) settled++;
    else skipped++;
  }
  return { settled, skipped };
}

async function settleOneCompetition(competitionId: string, now: Date): Promise<boolean> {
  const claimed = await claimCompetitionForSettlement(competitionId, now);
  if (!claimed) return false; // already settled (or claimed by a concurrent run)

  const instrument = await getInstrumentById(claimed.instrumentId);
  if (!instrument) return false; // shouldn't happen - the FK guarantees it exists

  // The final valuation price (AR-18: "square-off deadline, last price used
  // after") - deliberately NOT staleness-checked the way a live trade is;
  // this is a one-time snapshot of whatever the last real tick was, not a
  // new trade being priced. If genuinely no price has ever been written for
  // this instrument, this competition is left claimed-but-unsettled - a
  // real operational gap that needs a person to look at the relay, not
  // something to paper over with a fabricated price.
  const price = await getRelayPrice(instrument.symbol, instrument.exchange);
  if (!price) return false;

  const [allEntries, minQualifyingTrades, multiplier] = await Promise.all([
    listEntriesForCompetition(competitionId),
    getSettingNumber(COMPETITION_MIN_QUALIFYING_TRADES_KEY, DEFAULT_COMPETITION_MIN_QUALIFYING_TRADES),
    getVmIssuanceMultiplier(),
  ]);
  if (allEntries.length === 0) return true; // nothing to rank, competition still counts as settled

  const tradeCounts = await countTradesForEntries(allEntries.map((e) => e.id));
  // D59: an entry with fewer than the minimum qualifying trades is excluded
  // from ranking and prizes entirely - same as never having entered.
  const qualifying = allEntries.filter((e) => (tradeCounts.get(e.id) ?? 0) >= minQualifyingTrades);
  if (qualifying.length === 0) return true;

  const ranked = rankEntriesByRoi(qualifying, price.pricePaise, claimed.virtualCapitalPaise);

  for (const r of ranked) {
    const band = claimed.prizes.find((p) => r.rank >= p.rankFrom && r.rank <= p.rankTo);
    if (!band) continue; // outside every prize band - ranked, but nothing to pay

    const vmAwarded = Math.round(band.vmAmount * multiplier);

    await db.transaction(async (tx) => {
      const prize = await insertCompetitionPrizeIfNew(tx, {
        competitionId,
        userId: r.userId,
        rank: r.rank,
        endingValuePaise: r.endingValuePaise,
        roiPctBasisPoints: r.roiPctBasisPoints,
        vmAwarded,
        badgeId: band.badgeId,
      });
      if (!prize) return; // already paid (inner idempotency gate)

      if (vmAwarded > 0) {
        await insertVmoneyLedgerEntryIfNew(tx, {
          userId: r.userId,
          amountPaise: vmAwarded * VM_TO_LEDGER_PAISE,
          sourceType: "competition_prize",
          sourceId: prize.id,
          ruleId: null,
          multiplierApplied: multiplier,
          reason: `Competition rank #${r.rank} prize`,
        });
      }
      if (band.badgeId) {
        await insertUserBadgeIfAbsent(r.userId, band.badgeId, tx);
      }
    });
  }

  return true;
}

// --- Admin CRUD ---

export async function listCompetitionsForAdminService() {
  return listCompetitionsForAdmin();
}

export async function createCompetitionDraft(actor: { id: string }, input: CompetitionDraftInput, meta: RequestMeta) {
  const created = await insertDraftCompetition(input);
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "competitions.created",
    targetType: "competitions",
    targetId: created.id,
    metadata: input,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return created;
}

export async function updateCompetitionDraft(
  actor: { id: string },
  id: string,
  input: CompetitionDraftInput,
  meta: RequestMeta,
) {
  const updated = await updateDraftCompetition(id, input);
  if (!updated) throw new AppError("NOT_FOUND", "Draft competition not found (or already published)");
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "competitions.updated",
    targetType: "competitions",
    targetId: id,
    metadata: input,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

export async function publishCompetition(actor: { id: string }, id: string, meta: RequestMeta) {
  const published = await publishCompetitionRow(id, actor.id);
  if (!published) throw new AppError("NOT_FOUND", "Draft competition not found (or already published)");
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "competitions.published",
    targetType: "competitions",
    targetId: id,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return published;
}

export async function getCompetitionPrizeForUser(competitionId: string, userId: string) {
  return getPrizeForUser(competitionId, userId);
}

export async function getCompetitionByIdForAdmin(id: string) {
  return getCompetitionById(id);
}
