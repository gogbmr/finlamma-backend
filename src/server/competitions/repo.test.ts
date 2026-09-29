// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - same pattern as src/server/orders/repo.test.ts. The single
// most important test in this file is "never writes to vmoney_ledger" below:
// docs/ARCHITECTURE.md D57 requires that placing/settling competition trades
// never creates real V Money except the one prize row at settlement, and
// this is the user's own explicit, direct instruction to verify it.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { instruments, marketControls, users, vmoneyLedger, MARKET_CONTROLS_SINGLETON_ID } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const mockGetRelayPrice = vi.fn();
vi.mock("@/server/trading/relay-price", () => ({
  getRelayPrice: (symbol: unknown, exchange: unknown) => mockGetRelayPrice(symbol, exchange),
}));

const {
  claimCompetitionForSettlement,
  getCompetitionTradeByIdempotencyKeyTx,
  getEntry,
  insertCompetitionPrizeIfNew,
  insertDraftCompetition,
  insertEntryIfNew,
  listPublishedCompetitionsPastWindowEnd,
  placeCompetitionTradeTx,
  publishCompetitionRow,
  updateDraftCompetition,
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

async function makeUser() {
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: uniqueClerkUserId("competitions-repo-user"),
      clerkUpdatedAt: new Date(),
      firstName: "Meera",
      lastInitial: "K",
    })
    .returning();
  return user!;
}

async function makeInstrument(overrides: Partial<Record<string, unknown>> = {}) {
  const symbol = `CMP${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  const [row] = await db
    .insert(instruments)
    .values({
      symbol,
      exchange: "NSE",
      name: "Competition Test Co",
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

async function makeDraftCompetition(instrumentId: string, overrides: Partial<Record<string, unknown>> = {}) {
  return insertDraftCompetition({
    name: { en: "Test Cup", hi: "Test Cup", hx: "Test Cup" },
    instrumentId,
    virtualCapitalPaise: 10_000_000, // ₹1,00,000
    windowStart: new Date("2026-10-01T00:00:00.000Z"),
    windowEnd: new Date("2026-10-31T00:00:00.000Z"),
    prizes: [
      { rankFrom: 1, rankTo: 1, vmAmount: 5000, badgeId: null },
      { rankFrom: 2, rankTo: 3, vmAmount: 2000, badgeId: null },
      { rankFrom: 4, rankTo: 10, vmAmount: 500, badgeId: null },
    ],
    rules: { en: "r", hi: "r", hx: "r" },
    ...overrides,
  });
}

const MARKET_OPEN_NOW = new Date("2026-10-05T05:00:00.000Z"); // 10:30 IST, Monday

function freshIdempotencyKey() {
  return randomUUID();
}

async function ledgerRowsFor(userId: string) {
  return db.select().from(vmoneyLedger).where(eq(vmoneyLedger.userId, userId));
}

describe("insertEntryIfNew", () => {
  it("creates an entry with cash starting at the competition's virtual capital", async () => {
    const instrument = await makeInstrument();
    const competition = await makeDraftCompetition(instrument.id);
    const user = await makeUser();

    const entry = await insertEntryIfNew(competition.id, user.id, competition.virtualCapitalPaise);

    expect(entry).not.toBeNull();
    expect(entry!.cashPaise).toBe(10_000_000);
    expect(entry!.qtyHeld).toBe(0);
  });

  it("is idempotent: a second call for the same (competition, user) returns null", async () => {
    const instrument = await makeInstrument();
    const competition = await makeDraftCompetition(instrument.id);
    const user = await makeUser();

    const first = await insertEntryIfNew(competition.id, user.id, competition.virtualCapitalPaise);
    const second = await insertEntryIfNew(competition.id, user.id, competition.virtualCapitalPaise);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    const stillOne = await getEntry(competition.id, user.id);
    expect(stillOne!.id).toBe(first!.id);
  });
});

describe("placeCompetitionTradeTx", () => {
  async function setup() {
    const instrument = await makeInstrument();
    const competition = await makeDraftCompetition(instrument.id);
    const user = await makeUser();
    const entry = await insertEntryIfNew(competition.id, user.id, competition.virtualCapitalPaise);
    return { instrument, competition, user, entry: entry! };
  }

  it("fills a buy: debits cash, credits qtyHeld, sets avgPricePaise", async () => {
    const { instrument, entry } = await setup();
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 10000, ts: MARKET_OPEN_NOW.getTime() });

    const result = await placeCompetitionTradeTx(
      entry.id,
      instrument,
      { side: "buy", qty: 5 },
      freshIdempotencyKey(),
      10,
      MARKET_OPEN_NOW,
    );

    expect(result.status).toBe("filled");
    if (result.status !== "filled") throw new Error("expected filled");
    expect(result.entry.cashPaise).toBe(entry.cashPaise - 5 * 10000);
    expect(result.entry.qtyHeld).toBe(5);
    expect(result.entry.avgPricePaise).toBe(10000);
  });

  it("fills a sell and computes realized P&L against the average buy price", async () => {
    const { instrument, entry } = await setup();
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 10000, ts: MARKET_OPEN_NOW.getTime() });
    await placeCompetitionTradeTx(entry.id, instrument, { side: "buy", qty: 5 }, freshIdempotencyKey(), 10, MARKET_OPEN_NOW);

    mockGetRelayPrice.mockResolvedValue({ pricePaise: 12000, ts: MARKET_OPEN_NOW.getTime() });
    const result = await placeCompetitionTradeTx(
      entry.id,
      instrument,
      { side: "sell", qty: 5 },
      freshIdempotencyKey(),
      10,
      MARKET_OPEN_NOW,
    );

    expect(result.status).toBe("filled");
    if (result.status !== "filled") throw new Error("expected filled");
    expect(result.trade.realizedPnlPaise).toBe(5 * (12000 - 10000));
    expect(result.entry.qtyHeld).toBe(0);
  });

  it("replays the same result on a repeated Idempotency-Key with the same request", async () => {
    const { instrument, entry } = await setup();
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 10000, ts: MARKET_OPEN_NOW.getTime() });
    const key = freshIdempotencyKey();

    const first = await placeCompetitionTradeTx(entry.id, instrument, { side: "buy", qty: 5 }, key, 10, MARKET_OPEN_NOW);
    const second = await placeCompetitionTradeTx(entry.id, instrument, { side: "buy", qty: 5 }, key, 10, MARKET_OPEN_NOW);

    expect(first.status).toBe("filled");
    expect(second.status).toBe("replayed");
    if (second.status !== "replayed" || first.status !== "filled") throw new Error("unexpected status");
    expect(second.trade.id).toBe(first.trade.id);
  });

  it("rejects a repeated Idempotency-Key used with a different request", async () => {
    const { instrument, entry } = await setup();
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 10000, ts: MARKET_OPEN_NOW.getTime() });
    const key = freshIdempotencyKey();

    await placeCompetitionTradeTx(entry.id, instrument, { side: "buy", qty: 5 }, key, 10, MARKET_OPEN_NOW);
    const conflict = await placeCompetitionTradeTx(entry.id, instrument, { side: "buy", qty: 6 }, key, 10, MARKET_OPEN_NOW);

    expect(conflict.status).toBe("idempotency_conflict");
  });

  it("rejects a buy that exceeds available cash", async () => {
    const { instrument, entry } = await setup();
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 10000, ts: MARKET_OPEN_NOW.getTime() });

    const result = await placeCompetitionTradeTx(
      entry.id,
      instrument,
      { side: "buy", qty: 100_000 },
      freshIdempotencyKey(),
      10,
      MARKET_OPEN_NOW,
    );

    expect(result.status).toBe("insufficient_cash");
  });

  it("rejects a sell that exceeds held quantity", async () => {
    const { instrument, entry } = await setup();
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 10000, ts: MARKET_OPEN_NOW.getTime() });

    const result = await placeCompetitionTradeTx(
      entry.id,
      instrument,
      { side: "sell", qty: 1 },
      freshIdempotencyKey(),
      10,
      MARKET_OPEN_NOW,
    );

    expect(result.status).toBe("insufficient_holdings");
  });

  it("rejects a trade once the entry has reached the max-trades limit", async () => {
    const { instrument, entry } = await setup();
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 10000, ts: MARKET_OPEN_NOW.getTime() });

    await placeCompetitionTradeTx(entry.id, instrument, { side: "buy", qty: 1 }, freshIdempotencyKey(), 1, MARKET_OPEN_NOW);
    const blocked = await placeCompetitionTradeTx(
      entry.id,
      instrument,
      { side: "buy", qty: 1 },
      freshIdempotencyKey(),
      1,
      MARKET_OPEN_NOW,
    );

    expect(blocked.status).toBe("max_trades_reached");
  });

  it("rejects a trade when the global halt is active", async () => {
    const { instrument, entry } = await setup();
    await db
      .insert(marketControls)
      .values({ id: MARKET_CONTROLS_SINGLETON_ID, feedMode: "live", globalHalt: true })
      .onConflictDoUpdate({ target: marketControls.id, set: { globalHalt: true } });
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 10000, ts: MARKET_OPEN_NOW.getTime() });

    const result = await placeCompetitionTradeTx(
      entry.id,
      instrument,
      { side: "buy", qty: 1 },
      freshIdempotencyKey(),
      10,
      MARKET_OPEN_NOW,
    );

    expect(result.status).toBe("market_halted");
  });

  it("rejects a trade when no relay price is available", async () => {
    const { instrument, entry } = await setup();
    mockGetRelayPrice.mockResolvedValue(null);

    const result = await placeCompetitionTradeTx(
      entry.id,
      instrument,
      { side: "buy", qty: 1 },
      freshIdempotencyKey(),
      10,
      MARKET_OPEN_NOW,
    );

    expect(result.status).toBe("price_unavailable");
  });

  it("rejects a trade when the relay price is stale", async () => {
    const { instrument, entry } = await setup();
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 10000, ts: MARKET_OPEN_NOW.getTime() - 120_000 });

    const result = await placeCompetitionTradeTx(
      entry.id,
      instrument,
      { side: "buy", qty: 1 },
      freshIdempotencyKey(),
      10,
      MARKET_OPEN_NOW,
    );

    expect(result.status).toBe("price_stale");
  });

  // The user's explicit, direct instruction tied to docs/ARCHITECTURE.md
  // D57: placing competition trades - buy, sell, a full round trip - must
  // NEVER insert a single row into vmoney_ledger for that user. Competition
  // cash is a non-convertible sandbox balance; the only VM ever created is
  // the prize at settlement (see settlement test below), never from trading
  // itself.
  it("never writes a vmoney_ledger row for the trading user, through a full buy/sell round trip", async () => {
    const { instrument, entry, user } = await setup();

    mockGetRelayPrice.mockResolvedValue({ pricePaise: 10000, ts: MARKET_OPEN_NOW.getTime() });
    await placeCompetitionTradeTx(entry.id, instrument, { side: "buy", qty: 5 }, freshIdempotencyKey(), 10, MARKET_OPEN_NOW);

    mockGetRelayPrice.mockResolvedValue({ pricePaise: 15000, ts: MARKET_OPEN_NOW.getTime() });
    await placeCompetitionTradeTx(entry.id, instrument, { side: "sell", qty: 5 }, freshIdempotencyKey(), 10, MARKET_OPEN_NOW);

    const ledgerRows = await ledgerRowsFor(user.id);
    expect(ledgerRows).toHaveLength(0);
  });
});

describe("settlement idempotency", () => {
  it("claimCompetitionForSettlement claims once; a second attempt on an already-settled competition returns null", async () => {
    const instrument = await makeInstrument();
    const competition = await makeDraftCompetition(instrument.id);
    await publishCompetitionRow(competition.id, randomUUID());

    const first = await claimCompetitionForSettlement(competition.id, MARKET_OPEN_NOW);
    const second = await claimCompetitionForSettlement(competition.id, MARKET_OPEN_NOW);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("insertCompetitionPrizeIfNew pays a given (competition, user) at most once", async () => {
    const instrument = await makeInstrument();
    const competition = await makeDraftCompetition(instrument.id);
    const user = await makeUser();

    const prizeInput = {
      competitionId: competition.id,
      userId: user.id,
      rank: 1,
      endingValuePaise: 12_000_000,
      roiPctBasisPoints: 2000,
      vmAwarded: 5000,
      badgeId: null,
    };

    const first = await insertCompetitionPrizeIfNew(db as never, prizeInput);
    const second = await insertCompetitionPrizeIfNew(db as never, prizeInput);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });
});

describe("listPublishedCompetitionsPastWindowEnd", () => {
  it("only returns published, unsettled competitions whose window has already ended", async () => {
    const instrument = await makeInstrument();
    const now = new Date("2026-11-01T00:00:00.000Z");

    const past = await makeDraftCompetition(instrument.id, {
      windowStart: new Date("2026-09-01T00:00:00.000Z"),
      windowEnd: new Date("2026-09-30T00:00:00.000Z"),
    });
    await publishCompetitionRow(past.id, randomUUID());

    const future = await makeDraftCompetition(instrument.id, {
      windowStart: new Date("2026-12-01T00:00:00.000Z"),
      windowEnd: new Date("2026-12-31T00:00:00.000Z"),
    });
    await publishCompetitionRow(future.id, randomUUID());

    const stillDraft = await makeDraftCompetition(instrument.id, {
      windowStart: new Date("2026-09-01T00:00:00.000Z"),
      windowEnd: new Date("2026-09-30T00:00:00.000Z"),
    });

    const due = await listPublishedCompetitionsPastWindowEnd(now);
    const dueIds = due.map((c) => c.id);

    expect(dueIds).toContain(past.id);
    expect(dueIds).not.toContain(future.id);
    expect(dueIds).not.toContain(stillDraft.id);
  });
});

describe("admin CRUD", () => {
  it("updateDraftCompetition only affects a competition still in draft", async () => {
    const instrument = await makeInstrument();
    const competition = await makeDraftCompetition(instrument.id);
    await publishCompetitionRow(competition.id, randomUUID());

    const updated = await updateDraftCompetition(competition.id, {
      name: { en: "Changed", hi: "Changed", hx: "Changed" },
      instrumentId: instrument.id,
      virtualCapitalPaise: 5_000_000,
      windowStart: competition.windowStart,
      windowEnd: competition.windowEnd,
      prizes: competition.prizes,
      rules: competition.rules,
    });

    expect(updated).toBeNull();
  });

  it("publishCompetitionRow only publishes a draft, never a published competition twice", async () => {
    const instrument = await makeInstrument();
    const competition = await makeDraftCompetition(instrument.id);

    const firstPublish = await publishCompetitionRow(competition.id, randomUUID());
    const secondPublish = await publishCompetitionRow(competition.id, randomUUID());

    expect(firstPublish).not.toBeNull();
    expect(firstPublish!.status).toBe("published");
    expect(secondPublish).toBeNull();
  });
});

// Sanity check on the trade lookup used by the idempotency check itself.
describe("getCompetitionTradeByIdempotencyKeyTx", () => {
  it("returns null when no trade exists yet for that key", async () => {
    const instrument = await makeInstrument();
    const competition = await makeDraftCompetition(instrument.id);
    const user = await makeUser();
    const entry = await insertEntryIfNew(competition.id, user.id, competition.virtualCapitalPaise);

    const found = await getCompetitionTradeByIdempotencyKeyTx(db as never, entry!.id, freshIdempotencyKey());

    expect(found).toBeNull();
  });
});

