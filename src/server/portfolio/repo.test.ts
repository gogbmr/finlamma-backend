// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the portfolio repo's queries against real rows
// produced by the actual order-placement transaction (src/server/orders/
// repo.ts's placeOrderTx), not hand-inserted fixtures, so realizedPnlPaise/
// positionOpenedAt are exactly what the real system would have written.
// Never touches the real Supabase database (see @/db/client's NODE_ENV=test
// guard). src/server/portfolio/service.test.ts covers the service layer
// (the equity-curve replay, shaping) with this repo mocked out.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { instruments, marketControls, users, MARKET_CONTROLS_SINGLETON_ID } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const mockGetRelayPrice = vi.fn();
vi.mock("@/server/trading/relay-price", () => ({
  getRelayPrice: (symbol: unknown, exchange: unknown) => mockGetRelayPrice(symbol, exchange),
}));

const { placeOrderTx } = await import("@/server/orders/repo");
const { creditVmoneyRow } = await import("@/server/economy/repo");
const {
  countOpenPositions,
  listClosedTradesForStats,
  listClosedTradesPage,
  listFilledOrdersChronological,
  listOpenPositions,
  sumBuyCostBasisPaise,
  sumRealizedPnlPaise,
} = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

beforeEach(async () => {
  mockGetRelayPrice.mockReset();
  await db
    .insert(marketControls)
    .values({ id: MARKET_CONTROLS_SINGLETON_ID, feedMode: "live", globalHalt: false })
    .onConflictDoUpdate({ target: marketControls.id, set: { feedMode: "live", globalHalt: false } });
});

afterEach(() => {
  vi.clearAllMocks();
});

const MARKET_OPEN_NOW = new Date("2026-09-21T05:00:00.000Z"); // 10:30 IST, Monday

async function makeUser() {
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: uniqueClerkUserId("portfolio-repo-user"),
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

function freshIdempotencyKey() {
  return randomUUID();
}

async function buyMarket(
  userId: string,
  instrument: Parameters<typeof placeOrderTx>[1],
  qty: number,
  pricePaise: number,
) {
  mockGetRelayPrice.mockResolvedValue({ pricePaise, ts: MARKET_OPEN_NOW.getTime() });
  const result = await placeOrderTx(
    userId,
    instrument,
    { symbol: instrument.symbol, side: "buy", type: "market", qty },
    freshIdempotencyKey(),
    MARKET_OPEN_NOW,
  );
  if (result.status !== "filled") throw new Error(`expected filled, got ${result.status}`);
  return result.order;
}

async function sellMarket(
  userId: string,
  instrument: Parameters<typeof placeOrderTx>[1],
  qty: number,
  pricePaise: number,
) {
  mockGetRelayPrice.mockResolvedValue({ pricePaise, ts: MARKET_OPEN_NOW.getTime() });
  const result = await placeOrderTx(
    userId,
    instrument,
    { symbol: instrument.symbol, side: "sell", type: "market", qty },
    freshIdempotencyKey(),
    MARKET_OPEN_NOW,
  );
  if (result.status !== "filled") throw new Error(`expected filled, got ${result.status}`);
  return result.order;
}

describe("listOpenPositions / countOpenPositions", () => {
  it("lists only holdings with qty > 0, and excludes a fully-sold-out instrument", async () => {
    const user = await makeUser();
    await grantVmoneyPaise(user.id, 1_000_000);
    const held = await makeInstrument();
    const soldOut = await makeInstrument();

    await buyMarket(user.id, held, 3, 10000);
    await buyMarket(user.id, soldOut, 2, 5000);
    await sellMarket(user.id, soldOut, 2, 5000);

    const positions = await listOpenPositions(user.id);
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({ symbol: held.symbol, qty: 3, avgPricePaise: 10000 });
    expect(await countOpenPositions(user.id)).toBe(1);
  });
});

describe("sumBuyCostBasisPaise / sumRealizedPnlPaise", () => {
  it("sums every BUY fill ever for cost basis, and every SELL fill's realized P&L", async () => {
    const user = await makeUser();
    await grantVmoneyPaise(user.id, 1_000_000);
    const instrument = await makeInstrument();

    await buyMarket(user.id, instrument, 2, 10000); // cost 20000
    await buyMarket(user.id, instrument, 1, 20000); // cost 20000, avg now 13333
    await sellMarket(user.id, instrument, 1, 25000); // realized 1*(25000-13333)=11667

    expect(await sumBuyCostBasisPaise(user.id)).toBe(40000);
    expect(await sumRealizedPnlPaise(user.id)).toBe(11667);
  });

  it("returns 0 for a user who has never traded", async () => {
    const user = await makeUser();
    expect(await sumBuyCostBasisPaise(user.id)).toBe(0);
    expect(await sumRealizedPnlPaise(user.id)).toBe(0);
  });
});

describe("listFilledOrdersChronological", () => {
  it("lists every fill oldest-first, across instruments", async () => {
    const user = await makeUser();
    await grantVmoneyPaise(user.id, 1_000_000);
    const a = await makeInstrument();
    const b = await makeInstrument();

    await buyMarket(user.id, a, 2, 10000);
    await buyMarket(user.id, b, 1, 5000);
    await sellMarket(user.id, a, 1, 12000);

    const rows = await listFilledOrdersChronological(user.id);
    expect(rows.map((r) => [r.symbol, r.side, r.qty, r.fillPricePaise])).toEqual([
      [a.symbol, "buy", 2, 10000],
      [b.symbol, "buy", 1, 5000],
      [a.symbol, "sell", 1, 12000],
    ]);
  });
});

describe("listClosedTradesForStats", () => {
  it("lists only SELL fills, with a non-negative hold-days figure", async () => {
    const user = await makeUser();
    await grantVmoneyPaise(user.id, 1_000_000);
    const instrument = await makeInstrument();

    await buyMarket(user.id, instrument, 2, 10000);
    await sellMarket(user.id, instrument, 1, 15000);

    const rows = await listClosedTradesForStats(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ symbol: instrument.symbol, realizedPnlPaise: 5000 });
    expect(rows[0]!.holdDays).toBeGreaterThanOrEqual(0);
  });
});

describe("listClosedTradesPage", () => {
  it("paginates closed (SELL) trades newest-first with a stable cursor", async () => {
    const user = await makeUser();
    await grantVmoneyPaise(user.id, 1_000_000);
    const instrument = await makeInstrument();
    await buyMarket(user.id, instrument, 5, 10000);
    await sellMarket(user.id, instrument, 1, 11000);
    await sellMarket(user.id, instrument, 1, 12000);
    await sellMarket(user.id, instrument, 1, 13000);

    const firstPage = await listClosedTradesPage(user.id, { limit: 2, cursor: null });
    expect(firstPage.data).toHaveLength(2);
    expect(firstPage.data.map((r) => r.fillPricePaise)).toEqual([13000, 12000]);
    expect(firstPage.nextCursor).not.toBeNull();

    const { decodeCursor } = await import("@/lib/http");
    const cursor = decodeCursor<{ filledAt: string; id: string }>(firstPage.nextCursor);
    const secondPage = await listClosedTradesPage(user.id, { limit: 2, cursor });
    expect(secondPage.data).toHaveLength(1);
    expect(secondPage.data[0]!.fillPricePaise).toBe(11000);
    expect(secondPage.nextCursor).toBeNull();
  });
});
