// Integration test against an in-process PGlite database (src/test/db.ts) -
// proves the Ops console's batched per-page aggregate queries (D48,
// docs/ARCHITECTURE.md) actually return correct GROUPED results, not just
// that they typecheck. Never touches the real Supabase database (see
// @/db/client's NODE_ENV=test guard).
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { funds, fundHoldings, fundOrders, holdings, instruments, orders, users } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  countActiveTradersToday,
  countOrdersToday,
  countOrdersTodayForUsers,
  listHoldingsForUsers,
  listTradingActiveUserIdsSorted,
  sumRealizedPnlForUsers,
  sumVmoneyBalancesForUsers,
  sumVmoneyInPlay,
} = await import("./repo");
const { creditVmoneyRow } = await import("@/server/economy/repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

const TODAY = new Date("2026-09-26T05:00:00.000Z");
const TODAY_START_UTC = new Date("2026-09-25T18:30:00.000Z"); // IST midnight for 2026-09-26
const YESTERDAY = new Date("2026-09-25T05:00:00.000Z");

async function makeUser() {
  const [user] = await db
    .insert(users)
    .values({ clerkUserId: uniqueClerkUserId("ops-repo-user"), clerkUpdatedAt: new Date(), firstName: "Aarav", lastInitial: "S" })
    .returning();
  return user!;
}

async function makeInstrument() {
  const symbol = `TST${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  const [row] = await db
    .insert(instruments)
    .values({
      symbol,
      exchange: "NSE",
      name: "Test Co",
      sector: "Testing",
      about: { en: "a", hi: "a", hx: "a" },
      tip: { en: "t", hi: "t", hx: "t" },
    })
    .returning();
  return row!;
}

async function makeFund() {
  const [row] = await db
    .insert(funds)
    .values({
      name: "Finlamma Test Fund",
      category: "index",
      risk: "low",
      description: { en: "a", hi: "a", hx: "a" },
      amfiSchemeCode: randomUUID().replace(/-/g, "").slice(0, 6),
      expenseRatioBps: 20,
      minLumpSumPaise: 10000,
      minSipPaise: 10000,
    })
    .returning();
  return row!;
}

async function makeStockOrder(userId: string, instrumentId: string, overrides: Partial<Record<string, unknown>> = {}) {
  await db.insert(orders).values({
    userId,
    instrumentId,
    side: "buy",
    type: "market",
    qty: 1,
    status: "filled",
    fillPricePaise: 10000,
    filledAt: TODAY,
    idempotencyKey: randomUUID(),
    createdAt: TODAY,
    ...overrides,
  });
}

async function makeFundOrder(userId: string, fundId: string, overrides: Partial<Record<string, unknown>> = {}) {
  await db.insert(fundOrders).values({
    userId,
    fundId,
    side: "buy",
    status: "filled",
    amountPaise: 10000,
    unitsMilli: 1000,
    navPaise: 10000,
    navDate: "2026-09-26",
    idempotencyKey: randomUUID(),
    createdAt: TODAY,
    ...overrides,
  });
}

describe("listTradingActiveUserIdsSorted", () => {
  it("includes a user with only a stock order, only a fund order, or both - and excludes a non-trader", async () => {
    const stockTrader = await makeUser();
    const fundTrader = await makeUser();
    const bothTrader = await makeUser();
    const nonTrader = await makeUser();
    const instrument = await makeInstrument();
    const fund = await makeFund();

    await makeStockOrder(stockTrader.id, instrument.id);
    await makeFundOrder(fundTrader.id, fund.id);
    await makeStockOrder(bothTrader.id, instrument.id);
    await makeFundOrder(bothTrader.id, fund.id);

    const ids = await listTradingActiveUserIdsSorted();

    expect(ids).toContain(stockTrader.id);
    expect(ids).toContain(fundTrader.id);
    expect(ids).toContain(bothTrader.id);
    expect(ids).not.toContain(nonTrader.id);
    // no duplicate for the user with both a stock and a fund order
    expect(ids.filter((id) => id === bothTrader.id)).toHaveLength(1);
  });
});

describe("sumVmoneyBalancesForUsers", () => {
  it("groups by user and never mixes balances across users", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await creditVmoneyRow({ userId: a.id, sourceType: "test", sourceId: randomUUID(), ruleId: null, reason: "x", amountPaise: 100000, multiplierApplied: 1 });
    await creditVmoneyRow({ userId: b.id, sourceType: "test", sourceId: randomUUID(), ruleId: null, reason: "x", amountPaise: 50000, multiplierApplied: 1 });

    const balances = await sumVmoneyBalancesForUsers([a.id, b.id]);

    expect(balances.get(a.id)).toBe(100000);
    expect(balances.get(b.id)).toBe(50000);
  });

  it("returns an empty map for an empty input, never queries with an empty IN()", async () => {
    expect(await sumVmoneyBalancesForUsers([])).toEqual(new Map());
  });
});

describe("countOrdersTodayForUsers", () => {
  it("counts today's stock + fund orders combined per user, excluding earlier days", async () => {
    const user = await makeUser();
    const instrument = await makeInstrument();
    const fund = await makeFund();
    await makeStockOrder(user.id, instrument.id, { createdAt: TODAY });
    await makeFundOrder(user.id, fund.id, { createdAt: TODAY });
    await makeStockOrder(user.id, instrument.id, { createdAt: YESTERDAY, idempotencyKey: randomUUID() });

    const counts = await countOrdersTodayForUsers([user.id], TODAY_START_UTC);

    expect(counts.get(user.id)).toBe(2);
  });
});

describe("countActiveTradersToday / countOrdersToday", () => {
  // These two functions scan the WHOLE orders/fund_orders table (never
  // scoped to specific user ids, unlike every other function in this
  // file) - this PGlite instance persists across every `it()` here, so
  // this test uses its own dedicated day (never MARKET_OPEN_NOW/TODAY,
  // which other tests above already wrote real rows against) to stay
  // correct regardless of what earlier tests inserted.
  it("counts distinct traders and total orders scoped to today only", async () => {
    const dedicatedDay = new Date("2027-03-15T05:00:00.000Z");
    const dedicatedDayStartUtc = new Date("2027-03-14T18:30:00.000Z"); // IST midnight for 2027-03-15
    const dedicatedYesterday = new Date("2027-03-14T05:00:00.000Z");
    const a = await makeUser();
    const b = await makeUser();
    const instrument = await makeInstrument();
    await makeStockOrder(a.id, instrument.id, { createdAt: dedicatedDay });
    await makeStockOrder(a.id, instrument.id, { createdAt: dedicatedDay, idempotencyKey: randomUUID() });
    await makeStockOrder(b.id, instrument.id, { createdAt: dedicatedYesterday, idempotencyKey: randomUUID() });

    expect(await countActiveTradersToday(dedicatedDayStartUtc)).toBe(1); // only `a` traded on the dedicated day
    expect(await countOrdersToday(dedicatedDayStartUtc)).toBe(2); // both of a's orders that day, not b's
  });
});

describe("sumRealizedPnlForUsers", () => {
  it("sums SELL fills only, stock + fund combined, grouped by user", async () => {
    const user = await makeUser();
    const instrument = await makeInstrument();
    const fund = await makeFund();
    await db.insert(orders).values({
      userId: user.id, instrumentId: instrument.id, side: "sell", type: "market", qty: 1,
      status: "filled", fillPricePaise: 12000, realizedPnlPaise: 2000, filledAt: TODAY,
      idempotencyKey: randomUUID(), createdAt: TODAY,
    });
    await db.insert(fundOrders).values({
      userId: user.id, fundId: fund.id, side: "sell", status: "filled",
      amountPaise: 11000, unitsMilli: 1000, navPaise: 11000, navDate: "2026-09-26",
      realizedPnlPaise: 1000, idempotencyKey: randomUUID(), createdAt: TODAY,
    });

    const realized = await sumRealizedPnlForUsers([user.id]);

    expect(realized.get(user.id)).toBe(3000);
  });
});

describe("listHoldingsForUsers", () => {
  it("lists only positive-qty stock and fund holdings, grouped implicitly by userId field", async () => {
    const user = await makeUser();
    const instrument = await makeInstrument();
    const fund = await makeFund();
    await db.insert(holdings).values({ userId: user.id, instrumentId: instrument.id, qty: 5, avgPricePaise: 10000 });
    await db.insert(fundHoldings).values({ userId: user.id, fundId: fund.id, unitsMilli: 2000, avgNavPaise: 10000 });
    // a fully-sold-out holding (qty 0) must never appear
    const soldOutInstrument = await makeInstrument();
    await db.insert(holdings).values({ userId: user.id, instrumentId: soldOutInstrument.id, qty: 0, avgPricePaise: 10000 });

    const { stock, fund: fundRows } = await listHoldingsForUsers([user.id]);

    expect(stock).toHaveLength(1);
    expect(stock[0]).toMatchObject({ userId: user.id, instrumentId: instrument.id, qty: 5 });
    expect(fundRows).toHaveLength(1);
    expect(fundRows[0]).toMatchObject({ userId: user.id, fundId: fund.id, unitsMilli: 2000 });
  });
});

describe("sumVmoneyInPlay", () => {
  it("sums balance only across the given (trading-active) user ids", async () => {
    const trader = await makeUser();
    const nonTrader = await makeUser();
    await creditVmoneyRow({ userId: trader.id, sourceType: "test", sourceId: randomUUID(), ruleId: null, reason: "x", amountPaise: 70000, multiplierApplied: 1 });
    await creditVmoneyRow({ userId: nonTrader.id, sourceType: "test", sourceId: randomUUID(), ruleId: null, reason: "x", amountPaise: 999999, multiplierApplied: 1 });

    const total = await sumVmoneyInPlay([trader.id]);

    expect(total).toBe(70000); // nonTrader's balance is NOT included
  });
});
