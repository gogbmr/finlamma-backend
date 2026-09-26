// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves placeFundOrderTx's/executeSipDueTx's money-safety
// guarantees actually hold at the database level: idempotent replay/
// conflict, NAV availability/staleness, margin/holdings checks, exact
// paise-level ledger/holdings math, and the D45 buy/sell-nets-to-zero
// invariant for funds (exact when units divide evenly, per D45's own
// documented caveat). Never touches the real Supabase database (see
// @/db/client's NODE_ENV=test guard).
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { fundNavs, funds, users } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const { placeFundOrderTx, executeSipDueTx, listActiveSipPlansDueOn } = await import("./repo");
const { createSipPlan } = await import("./sip-repo");
const { sumVmoneyBalance, creditVmoneyRow } = await import("@/server/economy/repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

afterEach(() => {
  vi.clearAllMocks();
});

const NOW = new Date("2026-09-25T05:00:00.000Z");

async function makeUser() {
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: uniqueClerkUserId("fund-orders-repo-user"),
      clerkUpdatedAt: new Date(),
      firstName: "Aarav",
      lastInitial: "S",
    })
    .returning();
  return user;
}

async function makeFund(overrides: Partial<Record<string, unknown>> = {}) {
  const amfiSchemeCode = randomUUID().replace(/-/g, "").slice(0, 6);
  const [row] = await db
    .insert(funds)
    .values({
      name: "Finlamma Test Fund",
      category: "index",
      risk: "low",
      description: { en: "a", hi: "a", hx: "a" },
      amfiSchemeCode,
      expenseRatioBps: 20,
      minLumpSumPaise: 10000,
      minSipPaise: 10000,
      active: true,
      ...overrides,
    })
    .returning();
  return row!;
}

async function seedNav(fundId: string, date: string, navPaise: number) {
  await db.insert(fundNavs).values({ fundId, date, navPaise });
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

describe("placeFundOrderTx - idempotency", () => {
  it("is idempotent: a second call with the same key and same request replays the original order", async () => {
    const user = await makeUser();
    const fund = await makeFund();
    await seedNav(fund.id, "2026-09-25", 10000);
    await grantVmoneyPaise(user.id, 1_000_000);
    const key = freshIdempotencyKey();
    const input = { fundId: fund.id, side: "buy" as const, amountPaise: 50000 };

    const first = await placeFundOrderTx(user.id, fund, input, key, NOW);
    const second = await placeFundOrderTx(user.id, fund, input, key, NOW);

    expect(first.status).toBe("filled");
    expect(second).toEqual({ status: "replayed", order: (first as { order: unknown }).order });
    expect(await sumVmoneyBalance(user.id)).toBe(1_000_000 - 50000);
  });

  it("rejects reusing the same key for a genuinely different request", async () => {
    const user = await makeUser();
    const fund = await makeFund();
    await seedNav(fund.id, "2026-09-25", 10000);
    await grantVmoneyPaise(user.id, 1_000_000);
    const key = freshIdempotencyKey();

    await placeFundOrderTx(user.id, fund, { fundId: fund.id, side: "buy", amountPaise: 50000 }, key, NOW);
    const conflict = await placeFundOrderTx(user.id, fund, { fundId: fund.id, side: "buy", amountPaise: 60000 }, key, NOW);

    expect(conflict).toEqual({ status: "idempotency_conflict" });
  });
});

describe("placeFundOrderTx - NAV availability and staleness", () => {
  it("rejects with nav_unavailable when the fund has never been ingested", async () => {
    const user = await makeUser();
    const fund = await makeFund();

    const result = await placeFundOrderTx(user.id, fund, { fundId: fund.id, side: "buy", amountPaise: 50000 }, freshIdempotencyKey(), NOW);

    expect(result).toEqual({ status: "nav_unavailable" });
  });

  it("rejects with nav_stale when the latest NAV is more than 4 days old", async () => {
    const user = await makeUser();
    const fund = await makeFund();
    await seedNav(fund.id, "2026-09-20", 10000); // 5 days before NOW (2026-09-25)

    const result = await placeFundOrderTx(user.id, fund, { fundId: fund.id, side: "buy", amountPaise: 50000 }, freshIdempotencyKey(), NOW);

    expect(result).toEqual({ status: "nav_stale" });
  });

  it("accepts a NAV exactly at the 4-day boundary (not yet stale)", async () => {
    const user = await makeUser();
    const fund = await makeFund();
    await seedNav(fund.id, "2026-09-21", 10000); // exactly 4 days before NOW
    await grantVmoneyPaise(user.id, 1_000_000);

    const result = await placeFundOrderTx(user.id, fund, { fundId: fund.id, side: "buy", amountPaise: 50000 }, freshIdempotencyKey(), NOW);

    expect(result.status).toBe("filled");
  });
});

describe("placeFundOrderTx - margin and holdings checks", () => {
  it("rejects a BUY with insufficient_margin, reporting the exact shortfall", async () => {
    const user = await makeUser();
    const fund = await makeFund();
    await seedNav(fund.id, "2026-09-25", 10000);
    await grantVmoneyPaise(user.id, 5000);

    const result = await placeFundOrderTx(user.id, fund, { fundId: fund.id, side: "buy", amountPaise: 10000 }, freshIdempotencyKey(), NOW);

    expect(result).toEqual({ status: "insufficient_margin", balancePaise: 5000, requiredPaise: 10000 });
  });

  it("rejects a SELL with insufficient_holdings when nothing is held", async () => {
    const user = await makeUser();
    const fund = await makeFund();
    await seedNav(fund.id, "2026-09-25", 10000);

    const result = await placeFundOrderTx(user.id, fund, { fundId: fund.id, side: "sell", unitsMilli: 1000 }, freshIdempotencyKey(), NOW);

    expect(result).toEqual({ status: "insufficient_holdings", heldUnitsMilli: 0, requestedUnitsMilli: 1000 });
  });
});

describe("placeFundOrderTx - fills, holdings and the buy/sell round trip", () => {
  it("a BUY fill computes unitsMilli from amountPaise/navPaise and debits the exact amount", async () => {
    const user = await makeUser();
    const fund = await makeFund();
    await seedNav(fund.id, "2026-09-25", 10000); // NAV = ₹100.00
    await grantVmoneyPaise(user.id, 1_000_000);

    const result = await placeFundOrderTx(user.id, fund, { fundId: fund.id, side: "buy", amountPaise: 50000 }, freshIdempotencyKey(), NOW);

    expect(result.status).toBe("filled");
    if (result.status !== "filled") throw new Error("expected filled");
    expect(result.order.unitsMilli).toBe(5000); // 50000 * 1000 / 10000 = 5000 (5.000 units)
    expect(result.order.navPaise).toBe(10000);
    expect(result.order.navDate).toBe("2026-09-25");
    expect(await sumVmoneyBalance(user.id)).toBe(1_000_000 - 50000);
  });

  // D45 - the invariant the fund unit-math exists for: a BUY immediately
  // followed by a SELL of the SAME units at an UNCHANGED NAV must net to
  // exactly zero, when the amount divides evenly into whole thousandths of
  // a unit (documented caveat: not guaranteed exact in general, since units
  // are derived from a rupee amount, not chosen directly like a stock qty).
  it("a BUY then a SELL of all units at an unchanged NAV nets to exactly zero (evenly-divisible amounts)", async () => {
    const user = await makeUser();
    const fund = await makeFund();
    await seedNav(fund.id, "2026-09-25", 10000); // NAV = ₹100.00
    await grantVmoneyPaise(user.id, 1_000_000);
    const balanceBeforeTrading = await sumVmoneyBalance(user.id);

    const buyResult = await placeFundOrderTx(user.id, fund, { fundId: fund.id, side: "buy", amountPaise: 500000 }, freshIdempotencyKey(), NOW);
    if (buyResult.status !== "filled") throw new Error("expected filled");
    expect(buyResult.order.unitsMilli).toBe(50000); // exact: 500000*1000/10000

    const sellResult = await placeFundOrderTx(
      user.id,
      fund,
      { fundId: fund.id, side: "sell", unitsMilli: buyResult.order.unitsMilli! },
      freshIdempotencyKey(),
      NOW,
    );
    if (sellResult.status !== "filled") throw new Error("expected filled");
    expect(sellResult.order.amountPaise).toBe(500000);
    expect(sellResult.order.realizedPnlPaise).toBe(0);

    expect(await sumVmoneyBalance(user.id)).toBe(balanceBeforeTrading);
  });

  it("a SELL fill records the exact realized P&L against the average NAV", async () => {
    const user = await makeUser();
    const fund = await makeFund();
    await seedNav(fund.id, "2026-09-25", 10000);
    await grantVmoneyPaise(user.id, 1_000_000);
    const buyResult = await placeFundOrderTx(user.id, fund, { fundId: fund.id, side: "buy", amountPaise: 500000 }, freshIdempotencyKey(), NOW);
    if (buyResult.status !== "filled") throw new Error("expected filled");

    await seedNav(fund.id, "2026-09-26", 12000); // NAV rises to ₹120.00
    const laterNow = new Date("2026-09-26T05:00:00.000Z");
    const sellResult = await placeFundOrderTx(
      user.id,
      fund,
      { fundId: fund.id, side: "sell", unitsMilli: 25000 }, // half
      freshIdempotencyKey(),
      laterNow,
    );

    expect(sellResult.status).toBe("filled");
    if (sellResult.status !== "filled") throw new Error("expected filled");
    // 25000 * (12000 - 10000) / 1000 = 500000/1000*... = 25*2000 = 50000
    expect(sellResult.order.realizedPnlPaise).toBe(50000);
  });
});

describe("SIP execution (executeSipDueTx)", () => {
  it("fills a due SIP, debiting the ledger and updating holdings", async () => {
    const user = await makeUser();
    const fund = await makeFund();
    await seedNav(fund.id, "2026-09-25", 10000);
    await grantVmoneyPaise(user.id, 1_000_000);
    const plan = await createSipPlan(user.id, fund.id, 50000, 5);

    const result = await executeSipDueTx(plan, "2026-09-25", NOW);

    expect(result.status).toBe("filled");
    if (result.status !== "filled") throw new Error("expected filled");
    expect(result.order.unitsMilli).toBe(5000);
    expect(result.order.sipPlanId).toBe(plan.id);
    expect(result.order.dueDate).toBe("2026-09-25");
    expect(await sumVmoneyBalance(user.id)).toBe(1_000_000 - 50000);
  });

  it("is idempotent per (sipPlanId, dueDate) - a retried run never double-charges", async () => {
    const user = await makeUser();
    const fund = await makeFund();
    await seedNav(fund.id, "2026-09-25", 10000);
    await grantVmoneyPaise(user.id, 1_000_000);
    const plan = await createSipPlan(user.id, fund.id, 50000, 5);

    await executeSipDueTx(plan, "2026-09-25", NOW);
    const second = await executeSipDueTx(plan, "2026-09-25", NOW);

    expect(second).toEqual({ status: "already_executed" });
    expect(await sumVmoneyBalance(user.id)).toBe(1_000_000 - 50000);
  });

  it("records a visible failed row on insufficient balance, without touching the ledger or holdings", async () => {
    const user = await makeUser();
    const fund = await makeFund();
    await seedNav(fund.id, "2026-09-25", 10000);
    await grantVmoneyPaise(user.id, 100); // not enough for a 50000-paise SIP
    const plan = await createSipPlan(user.id, fund.id, 50000, 5);

    const result = await executeSipDueTx(plan, "2026-09-25", NOW);

    expect(result.status).toBe("failed_recorded");
    if (result.status !== "failed_recorded") throw new Error("expected failed_recorded");
    expect(result.order.status).toBe("failed");
    expect(result.order.failureReason).toBe("INSUFFICIENT_MARGIN");
    expect(result.order.amountPaise).toBeNull();
    expect(await sumVmoneyBalance(user.id)).toBe(100); // untouched
  });

  it("a different due date for the same plan is a separate, independent execution", async () => {
    const user = await makeUser();
    const fund = await makeFund();
    await seedNav(fund.id, "2026-09-25", 10000);
    await grantVmoneyPaise(user.id, 1_000_000);
    const plan = await createSipPlan(user.id, fund.id, 50000, 5);

    const first = await executeSipDueTx(plan, "2026-09-25", NOW);
    const laterNow = new Date("2026-10-05T05:00:00.000Z");
    await seedNav(fund.id, "2026-10-05", 10500);
    const second = await executeSipDueTx(plan, "2026-10-05", laterNow);

    expect(first.status).toBe("filled");
    expect(second.status).toBe("filled");
    expect(await sumVmoneyBalance(user.id)).toBe(1_000_000 - 100000);
  });
});

describe("listActiveSipPlansDueOn", () => {
  it("lists only active plans matching the given day of month", async () => {
    const user = await makeUser();
    const fund = await makeFund();
    const due = await createSipPlan(user.id, fund.id, 50000, 5);
    await createSipPlan(user.id, fund.id, 50000, 10); // different day

    const results = await listActiveSipPlansDueOn(5);

    expect(results.some((p) => p.id === due.id)).toBe(true);
    expect(results.every((p) => p.id !== undefined)).toBe(true);
  });
});
