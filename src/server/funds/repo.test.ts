// Integration test against an in-process PGlite database (src/test/db.ts) -
// proves the public-column projection actually omits amfiSchemeCode (D45)
// and the fund_navs (fundId, date) uniqueness/latest-lookup behavior at the
// database level. Never touches the real Supabase database (see
// @/db/client's NODE_ENV=test guard).
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { funds } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  getFundByIdInternal,
  getLatestNav,
  getNavForDate,
  getPublicFundById,
  insertNavIfNew,
  listActiveFunds,
  listFundsWithSchemeCodes,
} = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

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

describe("listActiveFunds / getPublicFundById", () => {
  it("never includes amfiSchemeCode in the public projection", async () => {
    const fund = await makeFund();

    const list = await listActiveFunds();
    const detail = await getPublicFundById(fund.id);

    for (const row of [...list, detail]) {
      expect(row).not.toHaveProperty("amfiSchemeCode");
    }
    expect(detail).toMatchObject({ id: fund.id, name: "Finlamma Test Fund" });
  });

  it("excludes an inactive fund from the active list", async () => {
    const active = await makeFund();
    await makeFund({ active: false });

    const list = await listActiveFunds();

    expect(list.some((f) => f.id === active.id)).toBe(true);
    expect(list.every((f) => f.active)).toBe(true);
  });
});

describe("getFundByIdInternal / listFundsWithSchemeCodes", () => {
  it("includes amfiSchemeCode for internal callers only", async () => {
    const fund = await makeFund();

    const internal = await getFundByIdInternal(fund.id);
    expect(internal?.amfiSchemeCode).toBe(fund.amfiSchemeCode);

    const withCodes = await listFundsWithSchemeCodes();
    expect(withCodes.find((f) => f.id === fund.id)?.amfiSchemeCode).toBe(fund.amfiSchemeCode);
  });
});

describe("insertNavIfNew / getLatestNav / getNavForDate", () => {
  it("is idempotent by (fundId, date) - a re-run never overwrites an already-recorded NAV", async () => {
    const fund = await makeFund();

    await insertNavIfNew(fund.id, "2026-09-24", 10000);
    await insertNavIfNew(fund.id, "2026-09-24", 99999); // must be a no-op, not an overwrite

    expect(await getNavForDate(fund.id, "2026-09-24")).toEqual({ navPaise: 10000, date: "2026-09-24" });
  });

  it("getLatestNav returns the most recent date, not insertion order", async () => {
    const fund = await makeFund();
    await insertNavIfNew(fund.id, "2026-09-20", 10000);
    await insertNavIfNew(fund.id, "2026-09-24", 10500);
    await insertNavIfNew(fund.id, "2026-09-22", 10200);

    expect(await getLatestNav(fund.id)).toEqual({ navPaise: 10500, date: "2026-09-24" });
  });

  it("returns null when a fund has never been ingested", async () => {
    const fund = await makeFund();
    expect(await getLatestNav(fund.id)).toBeNull();
    expect(await getNavForDate(fund.id, "2026-09-24")).toBeNull();
  });
});
