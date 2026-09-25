// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves placeOrderTx's money-safety guarantees actually hold
// at the database level: idempotent replay/conflict, halts, market hours,
// price staleness/availability, margin/holdings checks, and the exact
// paise-level holdings/ledger math a real fill produces. Never touches the
// real Supabase database (see @/db/client's NODE_ENV=test guard).
//
// getRelayPrice is mocked - this test is about the transaction's own logic,
// not Redis - and placeOrderTx's `now` param is always passed explicitly,
// never via vi.useFakeTimers() (that was tried first and caused a real,
// reproducible OOM crash against this PGlite instance - see placeOrderTx's
// own comment on why). See orders/service.test.ts for the service-layer
// status-to-AppError mapping.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  holdings,
  instruments,
  marketControls,
  marketHolidays,
  users,
  MARKET_CONTROLS_SINGLETON_ID,
} from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const mockGetRelayPrice = vi.fn();
vi.mock("@/server/trading/relay-price", () => ({
  getRelayPrice: (symbol: unknown, exchange: unknown) => mockGetRelayPrice(symbol, exchange),
}));

const { placeOrderTx } = await import("./repo");
const { sumVmoneyBalance, creditVmoneyRow } = await import("@/server/economy/repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

beforeEach(async () => {
  mockGetRelayPrice.mockReset();
  // This PGlite instance persists across every `it()` in this file, so a
  // test that sets a global halt/pause must not leak into later tests -
  // reset to the safe default before every test, not just the ones that
  // deliberately set something else.
  await db
    .insert(marketControls)
    .values({ id: MARKET_CONTROLS_SINGLETON_ID, feedMode: "live", globalHalt: false })
    .onConflictDoUpdate({ target: marketControls.id, set: { feedMode: "live", globalHalt: false } });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function makeUser() {
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: uniqueClerkUserId("orders-repo-user"),
      clerkUpdatedAt: new Date(),
      firstName: "Aarav",
      lastInitial: "S",
    })
    .returning();
  return user;
}

async function makeInstrument(overrides: Partial<Record<string, unknown>> = {}) {
  const symbol = `TST${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  const [row] = await db
    .insert(instruments)
    .values({
      symbol,
      exchange: "NSE",
      name: "Test Co Ltd",
      sector: "Testing",
      about: { en: "a", hi: "a", hx: "a" },
      tip: { en: "t", hi: "t", hx: "t" },
      tags: [],
      lotSize: 1,
      active: true,
      halted: false,
      ...overrides,
    })
    .returning();
  return row!;
}

async function grantVmoneyPaise(userId: string, amountPaise: number) {
  await creditVmoneyRow({
    userId,
    sourceType: "test_grant",
    sourceId: randomUUID(),
    ruleId: null,
    reason: "test setup",
    amountPaise,
    multiplierApplied: 1,
  });
}

// A Monday during NSE hours, no holidays seeded by default - see
// src/server/market/hours.test.ts for the exact boundary proofs; this file
// only needs ONE reliably-open instant to drive the transaction logic.
const MARKET_OPEN_NOW = new Date("2026-09-21T05:00:00.000Z"); // 10:30 IST, Monday
const WEEKEND_NOW = new Date("2026-09-19T06:00:00.000Z"); // Saturday

function freshIdempotencyKey() {
  return randomUUID();
}

async function getHoldingRow(userId: string, instrumentId: string) {
  const [row] = await db
    .select()
    .from(holdings)
    .where(and(eq(holdings.userId, userId), eq(holdings.instrumentId, instrumentId)));
  return row ?? null;
}

// Upsert, not a plain insert - the singleton row may already exist from an
// earlier test's getOrCreateMarketControls self-heal (this file's PGlite
// instance persists across every `it()`, there's no per-test reset).
async function setMarketControls(feedMode: "live" | "delayed_15m" | "paused", globalHalt: boolean) {
  await db
    .insert(marketControls)
    .values({ id: MARKET_CONTROLS_SINGLETON_ID, feedMode, globalHalt })
    .onConflictDoUpdate({ target: marketControls.id, set: { feedMode, globalHalt } });
}

describe("placeOrderTx - idempotency", () => {
  it("is idempotent: a second call with the same key and same request replays the original order", async () => {
    const user = await makeUser();
    const instrument = await makeInstrument();
    await grantVmoneyPaise(user.id, 1_000_000);
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 10000, ts: MARKET_OPEN_NOW.getTime() });
    const key = freshIdempotencyKey();
    const input = { symbol: instrument.symbol, side: "buy" as const, type: "market" as const, qty: 2 };

    const first = await placeOrderTx(user.id, instrument, input, key, MARKET_OPEN_NOW);
    const second = await placeOrderTx(user.id, instrument, input, key, MARKET_OPEN_NOW);

    expect(first.status).toBe("filled");
    expect(second).toEqual({ status: "replayed", order: (first as { order: unknown }).order });
    // No double debit - balance reflects exactly one fill.
    expect(await sumVmoneyBalance(user.id)).toBe(1_000_000 - 2 * 10000);
  });

  it("rejects reusing the same key for a genuinely different request", async () => {
    const user = await makeUser();
    const instrument = await makeInstrument();
    await grantVmoneyPaise(user.id, 1_000_000);
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 10000, ts: MARKET_OPEN_NOW.getTime() });
    const key = freshIdempotencyKey();

    await placeOrderTx(user.id, instrument, { symbol: instrument.symbol, side: "buy", type: "market", qty: 2 }, key, MARKET_OPEN_NOW);
    const conflict = await placeOrderTx(
      user.id,
      instrument,
      { symbol: instrument.symbol, side: "buy", type: "market", qty: 3 },
      key,
      MARKET_OPEN_NOW,
    );

    expect(conflict).toEqual({ status: "idempotency_conflict" });
  });
});

describe("placeOrderTx - halts and market controls", () => {
  it("rejects with market_halted when the global halt is on", async () => {
    const user = await makeUser();
    const instrument = await makeInstrument();
    await setMarketControls("live", true);

    const result = await placeOrderTx(
      user.id,
      instrument,
      { symbol: instrument.symbol, side: "buy", type: "market", qty: 1 },
      freshIdempotencyKey(),
      MARKET_OPEN_NOW,
    );

    expect(result).toEqual({ status: "market_halted" });
  });

  it("rejects with symbol_halted when this specific instrument is halted", async () => {
    const user = await makeUser();
    const instrument = await makeInstrument({ halted: true });

    const result = await placeOrderTx(
      user.id,
      instrument,
      { symbol: instrument.symbol, side: "buy", type: "market", qty: 1 },
      freshIdempotencyKey(),
      MARKET_OPEN_NOW,
    );

    expect(result).toEqual({ status: "symbol_halted" });
  });

  it("rejects with market_paused when the feed is paused", async () => {
    const user = await makeUser();
    const instrument = await makeInstrument();
    await setMarketControls("paused", false);

    const result = await placeOrderTx(
      user.id,
      instrument,
      { symbol: instrument.symbol, side: "buy", type: "market", qty: 1 },
      freshIdempotencyKey(),
      MARKET_OPEN_NOW,
    );

    expect(result).toEqual({ status: "market_paused" });
  });
});

describe("placeOrderTx - market hours", () => {
  it("rejects a MARKET order placed while the market is closed", async () => {
    const user = await makeUser();
    const instrument = await makeInstrument();

    const result = await placeOrderTx(
      user.id,
      instrument,
      { symbol: instrument.symbol, side: "buy", type: "market", qty: 1 },
      freshIdempotencyKey(),
      WEEKEND_NOW,
    );

    expect(result).toEqual({ status: "market_closed" });
  });

  it("queues a LIMIT order placed while the market is closed, with no price check at all", async () => {
    const user = await makeUser();
    const instrument = await makeInstrument();

    const result = await placeOrderTx(
      user.id,
      instrument,
      { symbol: instrument.symbol, side: "buy", type: "limit", qty: 1, limitPricePaise: 5000 },
      freshIdempotencyKey(),
      WEEKEND_NOW,
    );

    expect(result.status).toBe("queued");
    expect(mockGetRelayPrice).not.toHaveBeenCalled();
  });

  it("rejects a market holiday exactly like a weekend", async () => {
    const user = await makeUser();
    const instrument = await makeInstrument();
    // A different date than MARKET_OPEN_NOW - this test's own holiday seed
    // must never leak into other tests reusing that shared constant (this
    // file's PGlite instance persists across every `it()`).
    const holidayInstant = new Date("2026-09-22T05:00:00.000Z"); // 10:30 IST, Tuesday
    await db.insert(marketHolidays).values({ date: "2026-09-22", name: "Test Holiday" });

    const result = await placeOrderTx(
      user.id,
      instrument,
      { symbol: instrument.symbol, side: "buy", type: "market", qty: 1 },
      freshIdempotencyKey(),
      holidayInstant, // would otherwise be open
    );

    expect(result).toEqual({ status: "market_closed" });
  });
});

describe("placeOrderTx - price availability and staleness", () => {
  it("rejects with price_unavailable when the relay has no price for this symbol", async () => {
    const user = await makeUser();
    const instrument = await makeInstrument();
    mockGetRelayPrice.mockResolvedValue(null);

    const result = await placeOrderTx(
      user.id,
      instrument,
      { symbol: instrument.symbol, side: "buy", type: "market", qty: 1 },
      freshIdempotencyKey(),
      MARKET_OPEN_NOW,
    );

    expect(result).toEqual({ status: "price_unavailable" });
  });

  it("rejects with price_stale when the relay's price is older than 60 seconds", async () => {
    const user = await makeUser();
    const instrument = await makeInstrument();
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 10000, ts: MARKET_OPEN_NOW.getTime() - 61_000 });

    const result = await placeOrderTx(
      user.id,
      instrument,
      { symbol: instrument.symbol, side: "buy", type: "market", qty: 1 },
      freshIdempotencyKey(),
      MARKET_OPEN_NOW,
    );

    expect(result).toEqual({ status: "price_stale" });
  });

  it("accepts a price exactly at the 60-second boundary (not yet stale)", async () => {
    const user = await makeUser();
    const instrument = await makeInstrument();
    await grantVmoneyPaise(user.id, 1_000_000);
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 10000, ts: MARKET_OPEN_NOW.getTime() - 60_000 });

    const result = await placeOrderTx(
      user.id,
      instrument,
      { symbol: instrument.symbol, side: "buy", type: "market", qty: 1 },
      freshIdempotencyKey(),
      MARKET_OPEN_NOW,
    );

    expect(result.status).toBe("filled");
  });
});

describe("placeOrderTx - margin and holdings checks", () => {
  it("rejects a BUY with insufficient_margin, reporting the exact shortfall", async () => {
    const user = await makeUser();
    const instrument = await makeInstrument();
    await grantVmoneyPaise(user.id, 5000); // not enough for 1 share @ 10000
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 10000, ts: MARKET_OPEN_NOW.getTime() });

    const result = await placeOrderTx(
      user.id,
      instrument,
      { symbol: instrument.symbol, side: "buy", type: "market", qty: 1 },
      freshIdempotencyKey(),
      MARKET_OPEN_NOW,
    );

    expect(result).toEqual({ status: "insufficient_margin", balancePaise: 5000, requiredPaise: 10000 });
  });

  it("rejects a SELL with insufficient_holdings when nothing is held", async () => {
    const user = await makeUser();
    const instrument = await makeInstrument();
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 10000, ts: MARKET_OPEN_NOW.getTime() });

    const result = await placeOrderTx(
      user.id,
      instrument,
      { symbol: instrument.symbol, side: "sell", type: "market", qty: 1 },
      freshIdempotencyKey(),
      MARKET_OPEN_NOW,
    );

    expect(result).toEqual({ status: "insufficient_holdings", heldQty: 0, requestedQty: 1 });
  });
});

describe("placeOrderTx - fills, holdings and the buy/sell round trip", () => {
  it("a BUY fill debits the exact value and creates a holding at the fill price", async () => {
    const user = await makeUser();
    const instrument = await makeInstrument();
    await grantVmoneyPaise(user.id, 1_000_000);
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 46290, ts: MARKET_OPEN_NOW.getTime() });

    const result = await placeOrderTx(
      user.id,
      instrument,
      { symbol: instrument.symbol, side: "buy", type: "market", qty: 3 },
      freshIdempotencyKey(),
      MARKET_OPEN_NOW,
    );

    expect(result.status).toBe("filled");
    if (result.status !== "filled") throw new Error("expected filled");
    expect(result.order.fillPricePaise).toBe(46290);
    expect(await sumVmoneyBalance(user.id)).toBe(1_000_000 - 3 * 46290);

    const holding = await getHoldingRow(user.id, instrument.id);
    expect(holding).toMatchObject({ qty: 3, avgPricePaise: 46290 });
  });

  it("a second BUY at a different price blends into a correct weighted-average cost", async () => {
    const user = await makeUser();
    const instrument = await makeInstrument();
    await grantVmoneyPaise(user.id, 1_000_000);

    mockGetRelayPrice.mockResolvedValue({ pricePaise: 10000, ts: MARKET_OPEN_NOW.getTime() });
    await placeOrderTx(user.id, instrument, { symbol: instrument.symbol, side: "buy", type: "market", qty: 2 }, freshIdempotencyKey(), MARKET_OPEN_NOW);
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 20000, ts: MARKET_OPEN_NOW.getTime() });
    await placeOrderTx(user.id, instrument, { symbol: instrument.symbol, side: "buy", type: "market", qty: 2 }, freshIdempotencyKey(), MARKET_OPEN_NOW);

    const holding = await getHoldingRow(user.id, instrument.id);
    // (2*10000 + 2*20000) / 4 = 15000
    expect(holding).toMatchObject({ qty: 4, avgPricePaise: 15000 });
  });

  it("a SELL reduces qty without changing the average cost of the remaining shares", async () => {
    const user = await makeUser();
    const instrument = await makeInstrument();
    await grantVmoneyPaise(user.id, 1_000_000);

    mockGetRelayPrice.mockResolvedValue({ pricePaise: 10000, ts: MARKET_OPEN_NOW.getTime() });
    await placeOrderTx(user.id, instrument, { symbol: instrument.symbol, side: "buy", type: "market", qty: 4 }, freshIdempotencyKey(), MARKET_OPEN_NOW);
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 25000, ts: MARKET_OPEN_NOW.getTime() });
    await placeOrderTx(user.id, instrument, { symbol: instrument.symbol, side: "sell", type: "market", qty: 1 }, freshIdempotencyKey(), MARKET_OPEN_NOW);

    const holding = await getHoldingRow(user.id, instrument.id);
    expect(holding).toMatchObject({ qty: 3, avgPricePaise: 10000 }); // unchanged average
  });

  // D37 (docs/ARCHITECTURE.md) - the invariant the whole paise migration
  // exists for, now proven against the REAL order-placement transaction,
  // not a simulated ledger insert: a BUY immediately followed by a SELL of
  // the same qty at an unchanged price must net to EXACTLY zero.
  it("a BUY then a SELL of the same qty at an unchanged price nets to exactly zero", async () => {
    const user = await makeUser();
    const instrument = await makeInstrument();
    await grantVmoneyPaise(user.id, 1_000_000);
    const balanceBeforeTrading = await sumVmoneyBalance(user.id);
    // Deliberately not a round multiple of 100, same reasoning as
    // src/server/economy/repo.test.ts's own round-trip test.
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 46290, ts: MARKET_OPEN_NOW.getTime() });

    await placeOrderTx(user.id, instrument, { symbol: instrument.symbol, side: "buy", type: "market", qty: 3 }, freshIdempotencyKey(), MARKET_OPEN_NOW);
    await placeOrderTx(user.id, instrument, { symbol: instrument.symbol, side: "sell", type: "market", qty: 3 }, freshIdempotencyKey(), MARKET_OPEN_NOW);

    expect(await sumVmoneyBalance(user.id)).toBe(balanceBeforeTrading);
  });

  it("a marketable BUY limit fills at the better (lower) of the limit and the current price", async () => {
    const user = await makeUser();
    const instrument = await makeInstrument();
    await grantVmoneyPaise(user.id, 1_000_000);
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 9000, ts: MARKET_OPEN_NOW.getTime() });

    const result = await placeOrderTx(
      user.id,
      instrument,
      { symbol: instrument.symbol, side: "buy", type: "limit", qty: 1, limitPricePaise: 10000 },
      freshIdempotencyKey(),
      MARKET_OPEN_NOW,
    );

    expect(result.status).toBe("filled");
    if (result.status !== "filled") throw new Error("expected filled");
    expect(result.order.fillPricePaise).toBe(9000); // price improvement, not the limit
  });

  it("a non-marketable LIMIT order queues instead of filling, and never touches the ledger", async () => {
    const user = await makeUser();
    const instrument = await makeInstrument();
    await grantVmoneyPaise(user.id, 1_000_000);
    const balanceBefore = await sumVmoneyBalance(user.id);
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 15000, ts: MARKET_OPEN_NOW.getTime() });

    const result = await placeOrderTx(
      user.id,
      instrument,
      { symbol: instrument.symbol, side: "buy", type: "limit", qty: 1, limitPricePaise: 10000 },
      freshIdempotencyKey(),
      MARKET_OPEN_NOW,
    );

    expect(result.status).toBe("queued");
    if (result.status !== "queued") throw new Error("expected queued");
    expect(result.order.status).toBe("open");
    expect(result.order.fillPricePaise).toBeNull();
    expect(await sumVmoneyBalance(user.id)).toBe(balanceBefore);
  });
});
