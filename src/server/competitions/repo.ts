import { and, count, eq, gt, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { competitionEntries, competitionPrizes, competitions, competitionTrades } from "@/db/schema";
import type { DbOrTx } from "@/server/economy/repo";
import { isMarketOpen } from "@/server/market/hours";
import { getRelayPrice } from "@/server/trading/relay-price";
import { getOrCreateMarketControls, listMarketHolidays } from "@/server/trading/repo";

// Same staleness window as the real order book (src/server/orders/repo.ts) -
// a live trade must reject a stale price; this file's own settlement path
// (below) deliberately does NOT apply this constant, since a one-time
// end-of-competition valuation isn't a live trade (see getRelayPrice usage
// in settlement functions further down).
const PRICE_STALE_MS = 60_000;

export type CompetitionRow = typeof competitions.$inferSelect;
export type CompetitionEntryRow = typeof competitionEntries.$inferSelect;
export type CompetitionTradeRow = typeof competitionTrades.$inferSelect;

// --- Public / learner-facing reads ---

// The one competition a learner can currently see/enter - published, and
// `now` inside [windowStart, windowEnd). Once windowEnd passes it simply
// stops being "current" (even if not yet settled) - the app shows "no
// active competition" until the next one is published, same as
// report-card's "null until the first Monday" pattern.
export async function getCurrentCompetition(now: Date = new Date()): Promise<CompetitionRow | null> {
  const [row] = await db
    .select()
    .from(competitions)
    .where(and(eq(competitions.status, "published"), lte(competitions.windowStart, now), gt(competitions.windowEnd, now)))
    .limit(1);
  return row ?? null;
}

export async function getCompetitionById(id: string): Promise<CompetitionRow | null> {
  const [row] = await db.select().from(competitions).where(eq(competitions.id, id)).limit(1);
  return row ?? null;
}

export async function getEntry(competitionId: string, userId: string): Promise<CompetitionEntryRow | null> {
  const [row] = await db
    .select()
    .from(competitionEntries)
    .where(and(eq(competitionEntries.competitionId, competitionId), eq(competitionEntries.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listEntriesForCompetition(competitionId: string): Promise<CompetitionEntryRow[]> {
  return db.select().from(competitionEntries).where(eq(competitionEntries.competitionId, competitionId));
}

// One insert-and-conflict-as-done, D26-style - a learner can never hold two
// entries in the same competition (competition_entries' own unique index is
// the actual guarantee). `cashPaise` starts at the competition's own
// `virtualCapitalPaise` - never V Money, never a vmoney_ledger row
// (docs/ARCHITECTURE.md D57).
export async function insertEntryIfNew(
  competitionId: string,
  userId: string,
  cashPaise: number,
): Promise<CompetitionEntryRow | null> {
  const [row] = await db
    .insert(competitionEntries)
    .values({ competitionId, userId, cashPaise })
    .onConflictDoNothing({ target: [competitionEntries.competitionId, competitionEntries.userId] })
    .returning();
  return row ?? null;
}

export async function countTradesForEntry(entryId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(competitionTrades).where(eq(competitionTrades.entryId, entryId));
  return row?.n ?? 0;
}

// Bulk version for settlement - one query for every entry's trade count
// rather than one query per entrant.
export async function countTradesForEntries(entryIds: string[]): Promise<Map<string, number>> {
  if (entryIds.length === 0) return new Map();
  const rows = await db
    .select({ entryId: competitionTrades.entryId, n: count() })
    .from(competitionTrades)
    .where(inArray(competitionTrades.entryId, entryIds))
    .groupBy(competitionTrades.entryId);
  return new Map(rows.map((r) => [r.entryId, r.n]));
}

export async function getCompetitionTradeByIdempotencyKeyTx(
  txDb: DbOrTx,
  entryId: string,
  idempotencyKey: string,
): Promise<CompetitionTradeRow | null> {
  const [row] = await txDb
    .select()
    .from(competitionTrades)
    .where(and(eq(competitionTrades.entryId, entryId), eq(competitionTrades.idempotencyKey, idempotencyKey)))
    .limit(1);
  return row ?? null;
}

export type CompetitionTradeInput = { side: "buy" | "sell"; qty: number };

export type PlaceCompetitionTradeResult =
  | { status: "replayed"; trade: CompetitionTradeRow }
  | { status: "idempotency_conflict" }
  | { status: "market_halted" }
  | { status: "symbol_halted" }
  | { status: "market_paused" }
  | { status: "market_closed" }
  | { status: "max_trades_reached" }
  | { status: "price_unavailable" }
  | { status: "price_stale" }
  | { status: "insufficient_cash"; cashPaise: number; requiredPaise: number }
  | { status: "insufficient_holdings"; heldQty: number; requestedQty: number }
  | { status: "filled"; trade: CompetitionTradeRow; entry: CompetitionEntryRow };

// MARKET-only, single fixed instrument per competition (AR-18 never
// describes a LIMIT concept here) - mirrors placeOrderTx's shape
// (src/server/orders/repo.ts, D41) almost exactly: lock the owning row
// first, idempotency-key check first, same halt/pause/holiday/staleness
// checks against the SAME relay price a real order would use (never a
// separate, looser price path for the sandbox). The one addition is the
// max-trades check (D59), evaluated inside the same lock so a burst of
// concurrent requests can never place more than `maxTrades` fills.
// Everything here updates `competition_entries`/`competition_trades` only -
// never `vmoney_ledger`, never `holdings` (docs/ARCHITECTURE.md D57).
export async function placeCompetitionTradeTx(
  entryId: string,
  instrument: { symbol: string; exchange: string; halted: boolean },
  input: CompetitionTradeInput,
  idempotencyKey: string,
  maxTrades: number,
  now: Date = new Date(),
): Promise<PlaceCompetitionTradeResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${competitionEntries} where id = ${entryId} for update`);
    const [entry] = await tx.select().from(competitionEntries).where(eq(competitionEntries.id, entryId)).limit(1);

    const existing = await getCompetitionTradeByIdempotencyKeyTx(tx, entryId, idempotencyKey);
    if (existing) {
      const matches = existing.side === input.side && existing.qty === input.qty;
      return matches ? { status: "replayed", trade: existing } : { status: "idempotency_conflict" };
    }

    const controls = await getOrCreateMarketControls(tx);
    if (controls.globalHalt) return { status: "market_halted" };
    if (instrument.halted) return { status: "symbol_halted" };
    if (controls.feedMode === "paused") return { status: "market_paused" };

    const marketHolidays = await listMarketHolidays(tx);
    const holidayDates = new Set(marketHolidays.map((h) => h.date));
    if (!isMarketOpen(now, holidayDates)) return { status: "market_closed" };

    const tradeCount = await countTradesForEntry(entryId);
    if (tradeCount >= maxTrades) return { status: "max_trades_reached" };

    const price = await getRelayPrice(instrument.symbol, instrument.exchange);
    if (!price) return { status: "price_unavailable" };
    if (now.getTime() - price.ts > PRICE_STALE_MS) return { status: "price_stale" };

    const fillPricePaise = price.pricePaise;
    const valuePaise = input.qty * fillPricePaise;

    let realizedPnlPaise: number | null = null;
    let newCashPaise: number;
    let newQtyHeld: number;
    let newAvgPricePaise: number;

    if (input.side === "buy") {
      if (entry.cashPaise < valuePaise) {
        return { status: "insufficient_cash", cashPaise: entry.cashPaise, requiredPaise: valuePaise };
      }
      newQtyHeld = entry.qtyHeld + input.qty;
      newAvgPricePaise = Math.round((entry.qtyHeld * entry.avgPricePaise + valuePaise) / newQtyHeld);
      newCashPaise = entry.cashPaise - valuePaise;
    } else {
      if (entry.qtyHeld < input.qty) {
        return { status: "insufficient_holdings", heldQty: entry.qtyHeld, requestedQty: input.qty };
      }
      realizedPnlPaise = input.qty * (fillPricePaise - entry.avgPricePaise);
      newQtyHeld = entry.qtyHeld - input.qty;
      newAvgPricePaise = newQtyHeld === 0 ? 0 : entry.avgPricePaise;
      newCashPaise = entry.cashPaise + valuePaise;
    }

    const [trade] = await tx
      .insert(competitionTrades)
      .values({ entryId, side: input.side, qty: input.qty, fillPricePaise, realizedPnlPaise, idempotencyKey, filledAt: now })
      .returning();

    const [updatedEntry] = await tx
      .update(competitionEntries)
      .set({ cashPaise: newCashPaise, qtyHeld: newQtyHeld, avgPricePaise: newAvgPricePaise })
      .where(eq(competitionEntries.id, entryId))
      .returning();

    return { status: "filled", trade, entry: updatedEntry! };
  });
}

// --- Settlement (daily sweep) ---

export async function listPublishedCompetitionsPastWindowEnd(now: Date = new Date()): Promise<CompetitionRow[]> {
  return db
    .select()
    .from(competitions)
    .where(and(eq(competitions.status, "published"), lt(competitions.windowEnd, now), isNull(competitions.settledAt)));
}

// The OUTER idempotency gate (docs/ARCHITECTURE.md D57 comment on the
// schema): an atomic claim, same lock-then-check idiom D30/D49 already
// establish elsewhere. Returns null if another run already claimed (or
// finished) this competition - the caller then does nothing further for it.
export async function claimCompetitionForSettlement(competitionId: string, now: Date = new Date()): Promise<CompetitionRow | null> {
  const [row] = await db
    .update(competitions)
    .set({ settledAt: now })
    .where(and(eq(competitions.id, competitionId), isNull(competitions.settledAt)))
    .returning();
  return row ?? null;
}

// The INNER idempotency gate, per entrant - same D26/D55 shape as every
// other settlement in this codebase.
export async function insertCompetitionPrizeIfNew(
  txDb: DbOrTx,
  input: {
    competitionId: string;
    userId: string;
    rank: number;
    endingValuePaise: number;
    roiPctBasisPoints: number;
    vmAwarded: number;
    badgeId: string | null;
  },
) {
  const [row] = await txDb
    .insert(competitionPrizes)
    .values(input)
    .onConflictDoNothing({ target: [competitionPrizes.competitionId, competitionPrizes.userId] })
    .returning();
  return row ?? null;
}

export async function getPrizeForUser(competitionId: string, userId: string) {
  const [row] = await db
    .select()
    .from(competitionPrizes)
    .where(and(eq(competitionPrizes.competitionId, competitionId), eq(competitionPrizes.userId, userId)))
    .limit(1);
  return row ?? null;
}

// --- Admin CRUD (plain Zod-validated Server Action inputs, D16) ---

export async function listCompetitionsForAdmin(): Promise<CompetitionRow[]> {
  return db.select().from(competitions).orderBy(competitions.windowStart);
}

export type CompetitionDraftInput = {
  name: { en: string; hi: string; hx: string };
  instrumentId: string;
  virtualCapitalPaise: number;
  windowStart: Date;
  windowEnd: Date;
  prizes: Array<{ rankFrom: number; rankTo: number; vmAmount: number; badgeId: string | null }>;
  rules: { en: string; hi: string; hx: string };
};

export async function insertDraftCompetition(input: CompetitionDraftInput): Promise<CompetitionRow> {
  const [row] = await db.insert(competitions).values(input).returning();
  return row!;
}

export async function updateDraftCompetition(id: string, input: CompetitionDraftInput): Promise<CompetitionRow | null> {
  const [row] = await db
    .update(competitions)
    .set(input)
    .where(and(eq(competitions.id, id), eq(competitions.status, "draft")))
    .returning();
  return row ?? null;
}

export async function publishCompetitionRow(id: string, staffId: string): Promise<CompetitionRow | null> {
  const [row] = await db
    .update(competitions)
    .set({ status: "published", publishedAt: new Date(), publishedBy: staffId })
    .where(and(eq(competitions.id, id), eq(competitions.status, "draft")))
    .returning();
  return row ?? null;
}
