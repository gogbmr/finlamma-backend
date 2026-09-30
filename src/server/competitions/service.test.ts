import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentCompetition = vi.fn();
const mockGetCompetitionById = vi.fn();
const mockGetEntry = vi.fn();
const mockListEntriesForCompetition = vi.fn();
const mockInsertEntryIfNew = vi.fn();
const mockCountTradesForEntry = vi.fn();
const mockCountTradesForEntries = vi.fn();
const mockPlaceCompetitionTradeTx = vi.fn();
const mockListPublishedCompetitionsPastWindowEnd = vi.fn();
const mockClaimCompetitionForSettlement = vi.fn();
const mockInsertCompetitionPrizeIfNew = vi.fn();
const mockGetPrizeForUser = vi.fn();
const mockInsertDraftCompetition = vi.fn();
const mockUpdateDraftCompetition = vi.fn();
const mockPublishCompetitionRow = vi.fn();
const mockListCompetitionsForAdmin = vi.fn();
vi.mock("./repo", () => ({
  getCurrentCompetition: (now: unknown) => mockGetCurrentCompetition(now),
  getCompetitionById: (id: unknown) => mockGetCompetitionById(id),
  getEntry: (competitionId: unknown, userId: unknown) => mockGetEntry(competitionId, userId),
  listEntriesForCompetition: (competitionId: unknown) => mockListEntriesForCompetition(competitionId),
  insertEntryIfNew: (competitionId: unknown, userId: unknown, cashPaise: unknown) =>
    mockInsertEntryIfNew(competitionId, userId, cashPaise),
  countTradesForEntry: (entryId: unknown) => mockCountTradesForEntry(entryId),
  countTradesForEntries: (entryIds: unknown) => mockCountTradesForEntries(entryIds),
  placeCompetitionTradeTx: (
    entryId: unknown,
    instrument: unknown,
    input: unknown,
    key: unknown,
    maxTrades: unknown,
    now: unknown,
  ) => mockPlaceCompetitionTradeTx(entryId, instrument, input, key, maxTrades, now),
  listPublishedCompetitionsPastWindowEnd: (now: unknown) => mockListPublishedCompetitionsPastWindowEnd(now),
  claimCompetitionForSettlement: (id: unknown, now: unknown) => mockClaimCompetitionForSettlement(id, now),
  insertCompetitionPrizeIfNew: (tx: unknown, input: unknown) => mockInsertCompetitionPrizeIfNew(tx, input),
  getPrizeForUser: (competitionId: unknown, userId: unknown) => mockGetPrizeForUser(competitionId, userId),
  insertDraftCompetition: (input: unknown) => mockInsertDraftCompetition(input),
  updateDraftCompetition: (id: unknown, input: unknown) => mockUpdateDraftCompetition(id, input),
  publishCompetitionRow: (id: unknown, staffId: unknown) => mockPublishCompetitionRow(id, staffId),
  listCompetitionsForAdmin: () => mockListCompetitionsForAdmin(),
}));

const mockDbTransaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({}));
vi.mock("@/db/client", () => ({ db: { transaction: (fn: (tx: unknown) => Promise<unknown>) => mockDbTransaction(fn) } }));

const mockGetDisplayNamesForUserIds = vi.fn();
vi.mock("@/server/arena/repo", () => ({
  getDisplayNamesForUserIds: (ids: unknown) => mockGetDisplayNamesForUserIds(ids),
}));

vi.mock("@/server/economy/schemas", () => ({ VM_TO_LEDGER_PAISE: 100 }));

const mockGetVmIssuanceMultiplier = vi.fn();
vi.mock("@/server/economy/service", () => ({
  getVmIssuanceMultiplier: () => mockGetVmIssuanceMultiplier(),
}));

const mockInsertVmoneyLedgerEntryIfNew = vi.fn();
vi.mock("@/server/economy/repo", () => ({
  insertVmoneyLedgerEntryIfNew: (tx: unknown, input: unknown) => mockInsertVmoneyLedgerEntryIfNew(tx, input),
}));

const mockInsertUserBadgeIfAbsent = vi.fn();
vi.mock("@/server/badges/repo", () => ({
  insertUserBadgeIfAbsent: (userId: unknown, badgeId: unknown, tx: unknown) =>
    mockInsertUserBadgeIfAbsent(userId, badgeId, tx),
}));

const mockGetInstrumentById = vi.fn();
vi.mock("@/server/trading/repo", () => ({
  getInstrumentById: (id: unknown) => mockGetInstrumentById(id),
}));

const mockGetRelayPrice = vi.fn();
vi.mock("@/server/trading/relay-price", () => ({
  getRelayPrice: (symbol: unknown, exchange: unknown) => mockGetRelayPrice(symbol, exchange),
}));

const mockIsTradingUnlocked = vi.fn();
vi.mock("@/server/worlds/service", () => ({
  isTradingUnlocked: (userId: unknown) => mockIsTradingUnlocked(userId),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/redis", () => ({
  checkRateLimit: (id: unknown, config: unknown, failOpen: unknown) => mockCheckRateLimit(id, config, failOpen),
  TRADE_ORDER_RATE_LIMIT: { requests: 20, window: "60 s", prefix: "ratelimit:trade-order" },
}));

const mockGetSettingNumber = vi.fn();
const mockSetSettingJson = vi.fn();
vi.mock("@/lib/settings", () => ({
  getSettingNumber: (key: unknown, fallback: unknown) => mockGetSettingNumber(key, fallback),
  setSettingJson: (key: unknown, value: unknown, description: unknown) => mockSetSettingJson(key, value, description),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

const {
  enterCurrentCompetition,
  getMyCompetitionStatus,
  placeCompetitionTrade,
  rankEntriesByRoi,
  settleDueCompetitions,
} = await import("./service");

const USER = { id: "user_1" };
const META = { ip: null, userAgent: null };
const NOW = new Date("2026-10-15T00:00:00.000Z");

function competitionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "comp_1",
    name: { en: "Cup", hi: "Cup", hx: "Cup" },
    instrumentId: "inst_1",
    virtualCapitalPaise: 10_000_000,
    windowStart: new Date("2026-10-01T00:00:00.000Z"),
    windowEnd: new Date("2026-10-31T00:00:00.000Z"),
    prizes: [
      { rankFrom: 1, rankTo: 1, vmAmount: 5000, badgeId: "badge_champion" },
      { rankFrom: 2, rankTo: 3, vmAmount: 2000, badgeId: null },
      { rankFrom: 4, rankTo: 10, vmAmount: 500, badgeId: "badge_analyst" },
    ],
    rules: { en: "r", hi: "r", hx: "r" },
    status: "published",
    settledAt: null,
    ...overrides,
  };
}

function entryRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "entry_1",
    competitionId: "comp_1",
    userId: USER.id,
    cashPaise: 10_000_000,
    qtyHeld: 0,
    avgPricePaise: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSettingNumber.mockImplementation((_key: string, fallback: number) => Promise.resolve(fallback));
});

describe("rankEntriesByRoi - pure ranking", () => {
  it("ranks by ending value descending and computes ROI against the FULL starting capital", () => {
    const entries = [
      { userId: "a", id: "ea", cashPaise: 9_000_000, qtyHeld: 100 }, // 100 * 10000 + 9,000,000 = 10,000,000
      { userId: "b", id: "eb", cashPaise: 5_000_000, qtyHeld: 500 }, // 500 * 10000 + 5,000,000 = 10,000,000
      { userId: "c", id: "ec", cashPaise: 11_000_000, qtyHeld: 0 }, // ahead
    ];

    const ranked = rankEntriesByRoi(entries, 10000, 10_000_000);

    expect(ranked[0]!.userId).toBe("c");
    expect(ranked[0]!.rank).toBe(1);
    expect(ranked[0]!.roiPctBasisPoints).toBe(1000); // +10%
    // a and b tie at the same ending value - both rank after c, ROI 0.
    expect(ranked.find((r) => r.userId === "a")!.roiPctBasisPoints).toBe(0);
  });

  it("barely moves the needle for a tiny position that doubles, since most capital sat in cash", () => {
    // 1 share at 1000 paise, doubling to 2000 - a tiny fraction of 10,000,000 starting capital.
    const entries = [{ userId: "a", id: "ea", cashPaise: 9_999_000, qtyHeld: 1 }];
    const ranked = rankEntriesByRoi(entries, 2000, 10_000_000);
    // Ending value 9,999,000 + 2,000 = 10,001,000 -> +0.01% (1 basis point), not a huge move.
    expect(ranked[0]!.roiPctBasisPoints).toBe(1);
  });
});

describe("enterCurrentCompetition", () => {
  it("throws NOT_FOUND when there's no active competition", async () => {
    mockGetCurrentCompetition.mockResolvedValue(null);

    await expect(enterCurrentCompetition(USER, META, NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockInsertEntryIfNew).not.toHaveBeenCalled();
  });

  it("returns the existing entry rather than erroring on a repeat call", async () => {
    mockGetCurrentCompetition.mockResolvedValue(competitionRow());
    mockGetEntry.mockResolvedValue(entryRow());

    const result = await enterCurrentCompetition(USER, META, NOW);

    expect(result.id).toBe("entry_1");
    expect(mockInsertEntryIfNew).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN when trading is locked", async () => {
    mockGetCurrentCompetition.mockResolvedValue(competitionRow());
    mockGetEntry.mockResolvedValue(null);
    mockIsTradingUnlocked.mockResolvedValue(false);

    await expect(enterCurrentCompetition(USER, META, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws COMPETITION_ENTRY_CLOSED once past the entry-window deadline (D59)", async () => {
    // Window is Oct 1 - Oct 31 (30 days); default entryWindowPct is 50 ->
    // deadline is Oct 16. NOW here is well past that.
    mockGetCurrentCompetition.mockResolvedValue(competitionRow());
    mockGetEntry.mockResolvedValue(null);
    mockIsTradingUnlocked.mockResolvedValue(true);
    mockGetSettingNumber.mockResolvedValue(50);

    const lateNow = new Date("2026-10-25T00:00:00.000Z");
    await expect(enterCurrentCompetition(USER, META, lateNow)).rejects.toMatchObject({
      code: "COMPETITION_ENTRY_CLOSED",
    });
    expect(mockInsertEntryIfNew).not.toHaveBeenCalled();
  });

  it("creates a new entry with the competition's virtual capital when inside the window", async () => {
    mockGetCurrentCompetition.mockResolvedValue(competitionRow());
    mockGetEntry.mockResolvedValue(null);
    mockIsTradingUnlocked.mockResolvedValue(true);
    mockGetSettingNumber.mockResolvedValue(50);
    mockInsertEntryIfNew.mockResolvedValue(entryRow());

    const earlyNow = new Date("2026-10-05T00:00:00.000Z");
    const result = await enterCurrentCompetition(USER, META, earlyNow);

    expect(result.id).toBe("entry_1");
    expect(mockInsertEntryIfNew).toHaveBeenCalledWith("comp_1", USER.id, 10_000_000);
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "competitions.entered" }));
  });
});

describe("placeCompetitionTrade - error mapping", () => {
  beforeEach(() => {
    mockCheckRateLimit.mockResolvedValue({ allowed: true, configured: true });
    mockGetCurrentCompetition.mockResolvedValue(competitionRow());
    mockGetEntry.mockResolvedValue(entryRow());
    mockGetInstrumentById.mockResolvedValue({ id: "inst_1", symbol: "TST", exchange: "NSE", halted: false });
  });

  it("rejects with RATE_LIMITED before touching the competition at all", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, configured: true });

    await expect(placeCompetitionTrade(USER, { side: "buy", qty: 1 }, "key1", META, NOW)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect(mockGetCurrentCompetition).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when there's no active competition", async () => {
    mockGetCurrentCompetition.mockResolvedValue(null);

    await expect(placeCompetitionTrade(USER, { side: "buy", qty: 1 }, "key1", META, NOW)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws FORBIDDEN when the learner hasn't entered", async () => {
    mockGetEntry.mockResolvedValue(null);

    await expect(placeCompetitionTrade(USER, { side: "buy", qty: 1 }, "key1", META, NOW)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it.each([
    ["market_halted", "MARKET_HALTED"],
    ["symbol_halted", "SYMBOL_HALTED"],
    ["market_paused", "MARKET_PAUSED"],
    ["market_closed", "MARKET_CLOSED"],
    ["price_unavailable", "PRICE_UNAVAILABLE"],
    ["price_stale", "PRICE_STALE"],
  ] as const)("maps repo status %s to error code %s", async (status, code) => {
    mockPlaceCompetitionTradeTx.mockResolvedValue({ status });

    await expect(placeCompetitionTrade(USER, { side: "buy", qty: 1 }, "key1", META, NOW)).rejects.toMatchObject({
      code,
    });
  });

  it("maps max_trades_reached to COMPETITION_MAX_TRADES_REACHED", async () => {
    mockPlaceCompetitionTradeTx.mockResolvedValue({ status: "max_trades_reached" });

    await expect(placeCompetitionTrade(USER, { side: "buy", qty: 1 }, "key1", META, NOW)).rejects.toMatchObject({
      code: "COMPETITION_MAX_TRADES_REACHED",
    });
  });

  it("maps insufficient_cash to INSUFFICIENT_MARGIN with details", async () => {
    mockPlaceCompetitionTradeTx.mockResolvedValue({ status: "insufficient_cash", cashPaise: 100, requiredPaise: 200 });

    await expect(placeCompetitionTrade(USER, { side: "buy", qty: 1 }, "key1", META, NOW)).rejects.toMatchObject({
      code: "INSUFFICIENT_MARGIN",
    });
  });

  it("maps insufficient_holdings to INSUFFICIENT_HOLDINGS with details", async () => {
    mockPlaceCompetitionTradeTx.mockResolvedValue({ status: "insufficient_holdings", heldQty: 0, requestedQty: 1 });

    await expect(placeCompetitionTrade(USER, { side: "sell", qty: 1 }, "key1", META, NOW)).rejects.toMatchObject({
      code: "INSUFFICIENT_HOLDINGS",
    });
  });

  it("returns a replayed trade without logging activity again", async () => {
    mockPlaceCompetitionTradeTx.mockResolvedValue({ status: "replayed", trade: { id: "trade_1" } });

    const result = await placeCompetitionTrade(USER, { side: "buy", qty: 1 }, "key1", META, NOW);

    expect(result).toMatchObject({ id: "trade_1", replayed: true });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("logs activity on a genuine fill", async () => {
    mockPlaceCompetitionTradeTx.mockResolvedValue({
      status: "filled",
      trade: { id: "trade_2", fillPricePaise: 10000 },
      entry: entryRow(),
    });

    const result = await placeCompetitionTrade(USER, { side: "buy", qty: 1 }, "key1", META, NOW);

    expect(result).toMatchObject({ id: "trade_2", replayed: false });
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "competitions.trade_filled" }));
  });
});

describe("getMyCompetitionStatus", () => {
  it("returns null when there's no active competition", async () => {
    mockGetCurrentCompetition.mockResolvedValue(null);

    const result = await getMyCompetitionStatus(USER, NOW);

    expect(result).toBeNull();
  });

  it("returns entered:false when the learner hasn't entered", async () => {
    mockGetCurrentCompetition.mockResolvedValue(competitionRow());
    mockGetEntry.mockResolvedValue(null);

    const result = await getMyCompetitionStatus(USER, NOW);

    expect(result).toEqual({ entered: false });
  });

  it("computes live rank/ROI from the relay price when entered", async () => {
    mockGetCurrentCompetition.mockResolvedValue(competitionRow());
    mockGetEntry.mockResolvedValue(entryRow({ qtyHeld: 10, cashPaise: 9_900_000, avgPricePaise: 10000 }));
    mockGetInstrumentById.mockResolvedValue({ id: "inst_1", symbol: "TST", exchange: "NSE" });
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 11000, ts: NOW.getTime() });
    mockListEntriesForCompetition.mockResolvedValue([entryRow({ qtyHeld: 10, cashPaise: 9_900_000 })]);
    mockCountTradesForEntry.mockResolvedValue(3);

    const result = await getMyCompetitionStatus(USER, NOW);

    expect(result).toMatchObject({ entered: true, rank: 1, poolSize: 1, tradeCount: 3 });
  });
});

describe("settleDueCompetitions", () => {
  beforeEach(() => {
    mockGetVmIssuanceMultiplier.mockResolvedValue(1);
    mockGetSettingNumber.mockImplementation((_key: string, fallback: number) => Promise.resolve(fallback));
  });

  it("does nothing when no competition is due", async () => {
    mockListPublishedCompetitionsPastWindowEnd.mockResolvedValue([]);

    const result = await settleDueCompetitions(NOW);

    expect(result).toEqual({ settled: 0, skipped: 0 });
  });

  it("skips a competition that's already claimed (idempotent outer gate)", async () => {
    mockListPublishedCompetitionsPastWindowEnd.mockResolvedValue([competitionRow()]);
    mockClaimCompetitionForSettlement.mockResolvedValue(null);

    const result = await settleDueCompetitions(NOW);

    expect(result).toEqual({ settled: 0, skipped: 1 });
    expect(mockGetInstrumentById).not.toHaveBeenCalled();
  });

  it("excludes an entry below the minimum qualifying trades from ranking and prizes (D59)", async () => {
    const claimed = competitionRow();
    mockListPublishedCompetitionsPastWindowEnd.mockResolvedValue([claimed]);
    mockClaimCompetitionForSettlement.mockResolvedValue(claimed);
    mockGetInstrumentById.mockResolvedValue({ id: "inst_1", symbol: "TST", exchange: "NSE" });
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 12000, ts: NOW.getTime() });
    mockGetSettingNumber.mockImplementation((key: string) =>
      Promise.resolve(key === "competition_min_qualifying_trades" ? 5 : 10),
    );
    const winner = entryRow({ id: "entry_winner", userId: "winner", qtyHeld: 100, cashPaise: 0 });
    const underTraded = entryRow({ id: "entry_lucky", userId: "lucky", qtyHeld: 1000, cashPaise: 0 });
    mockListEntriesForCompetition.mockResolvedValue([winner, underTraded]);
    mockCountTradesForEntries.mockResolvedValue(
      new Map([
        ["entry_winner", 5],
        ["entry_lucky", 1],
      ]),
    );
    mockInsertCompetitionPrizeIfNew.mockResolvedValue({ id: "prize_1" });

    await settleDueCompetitions(NOW);

    // Only the qualifying entrant ("winner") should ever be paid - "lucky"
    // had the bigger ending value but only 1 trade, below the minimum.
    const paidUserIds = mockInsertCompetitionPrizeIfNew.mock.calls.map(([, input]) => input.userId);
    expect(paidUserIds).toEqual(["winner"]);
  });

  it("pays the VM prize and awards the badge for the winning rank", async () => {
    const claimed = competitionRow();
    mockListPublishedCompetitionsPastWindowEnd.mockResolvedValue([claimed]);
    mockClaimCompetitionForSettlement.mockResolvedValue(claimed);
    mockGetInstrumentById.mockResolvedValue({ id: "inst_1", symbol: "TST", exchange: "NSE" });
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 20000, ts: NOW.getTime() });
    mockGetSettingNumber.mockResolvedValue(1);
    const winner = entryRow({ id: "entry_winner", userId: "winner", qtyHeld: 100, cashPaise: 0 });
    mockListEntriesForCompetition.mockResolvedValue([winner]);
    mockCountTradesForEntries.mockResolvedValue(new Map([["entry_winner", 5]]));
    mockInsertCompetitionPrizeIfNew.mockResolvedValue({ id: "prize_1" });

    await settleDueCompetitions(NOW);

    expect(mockInsertVmoneyLedgerEntryIfNew).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "winner", sourceType: "competition_prize", amountPaise: 5000 * 100 }),
    );
    expect(mockInsertUserBadgeIfAbsent).toHaveBeenCalledWith("winner", "badge_champion", expect.anything());
  });

  it("never pays twice for the same entrant (inner idempotency gate)", async () => {
    const claimed = competitionRow();
    mockListPublishedCompetitionsPastWindowEnd.mockResolvedValue([claimed]);
    mockClaimCompetitionForSettlement.mockResolvedValue(claimed);
    mockGetInstrumentById.mockResolvedValue({ id: "inst_1", symbol: "TST", exchange: "NSE" });
    mockGetRelayPrice.mockResolvedValue({ pricePaise: 20000, ts: NOW.getTime() });
    mockGetSettingNumber.mockResolvedValue(1);
    mockListEntriesForCompetition.mockResolvedValue([entryRow({ userId: "winner", qtyHeld: 100 })]);
    mockCountTradesForEntries.mockResolvedValue(new Map([["entry_1", 5]]));
    mockInsertCompetitionPrizeIfNew.mockResolvedValue(null); // already paid

    await settleDueCompetitions(NOW);

    expect(mockInsertVmoneyLedgerEntryIfNew).not.toHaveBeenCalled();
    expect(mockInsertUserBadgeIfAbsent).not.toHaveBeenCalled();
  });
});
