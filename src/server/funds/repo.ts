import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { funds, fundNavs } from "@/db/schema";

// Same shape as src/server/trading/repo.ts's DbOrTx - getLatestNav is read
// INSIDE placeFundOrderTx's/executeSipDueTx's row-locked transaction
// (src/server/fund-orders/repo.ts), so it must accept that transaction
// handle rather than always querying the module-level `db` - on PGlite's
// single connection, issuing a second query against the base `db` while a
// transaction is still open on it deadlocks the whole test run (this bit
// exactly that way while building Checkpoint 8 - every read inside a
// transaction must go through the same `tx`, no exceptions).
export type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// D45 (docs/ARCHITECTURE.md): `amfiSchemeCode` is an internal-only field -
// every one of these selects an EXPLICIT column list that omits it, the
// same "never select(*) so an internal field can't accidentally leak"
// pattern src/server/economy/repo.ts's listVmoneyLedgerForUser already
// uses. Only listFundsWithSchemeCodes (below, for the AMFI ingestion job)
// ever reads it.
const PUBLIC_FUND_COLUMNS = {
  id: funds.id,
  name: funds.name,
  category: funds.category,
  risk: funds.risk,
  description: funds.description,
  expenseRatioBps: funds.expenseRatioBps,
  minLumpSumPaise: funds.minLumpSumPaise,
  minSipPaise: funds.minSipPaise,
  active: funds.active,
} as const;

export async function listActiveFunds() {
  return db.select(PUBLIC_FUND_COLUMNS).from(funds).where(eq(funds.active, true)).orderBy(asc(funds.name));
}

export async function getPublicFundById(id: string) {
  const [row] = await db.select(PUBLIC_FUND_COLUMNS).from(funds).where(eq(funds.id, id)).limit(1);
  return row ?? null;
}

// Internal shape - includes id/active/amfiSchemeCode, no display fields.
// Used by fund-orders (needs to validate a fundId exists+is active before
// placing an order) and the AMFI ingestion job (needs the scheme code).
// Never exported through any API response.
export async function getFundByIdInternal(id: string) {
  const [row] = await db
    .select({ id: funds.id, active: funds.active, amfiSchemeCode: funds.amfiSchemeCode, minLumpSumPaise: funds.minLumpSumPaise, minSipPaise: funds.minSipPaise })
    .from(funds)
    .where(eq(funds.id, id))
    .limit(1);
  return row ?? null;
}

// AMFI ingestion job (src/inngest/functions/amfi-nav-ingest.ts) - every
// active fund's id + the real scheme code it tracks. Internal-only, never
// exported through any API response (D45).
export async function listFundsWithSchemeCodes() {
  return db
    .select({ id: funds.id, amfiSchemeCode: funds.amfiSchemeCode })
    .from(funds)
    .where(eq(funds.active, true));
}

// --- NAV history (fund_navs) ---

// Idempotent by (fundId, date) - a retried/re-run ingestion for a date
// already ingested is a no-op, never a duplicate row or an overwrite of an
// already-recorded historical NAV (D45: fund_navs is append-only).
export async function insertNavIfNew(fundId: string, date: string, navPaise: number) {
  await db.insert(fundNavs).values({ fundId, date, navPaise }).onConflictDoNothing({
    target: [fundNavs.fundId, fundNavs.date],
  });
}

export type LatestNav = { navPaise: number; date: string };

// "Execute against the most recent ingested NAV" (founder's Checkpoint 8
// requirement) - never requires today's specifically, since funds have no
// NAV at all on a non-business day. Returns null if this fund has never
// been ingested even once.
export async function getLatestNav(fundId: string, txDb: DbOrTx = db): Promise<LatestNav | null> {
  const [row] = await txDb
    .select({ navPaise: fundNavs.navPaise, date: fundNavs.date })
    .from(fundNavs)
    .where(eq(fundNavs.fundId, fundId))
    .orderBy(desc(fundNavs.date))
    .limit(1);
  return row ?? null;
}

export async function getNavForDate(fundId: string, date: string): Promise<LatestNav | null> {
  const [row] = await db
    .select({ navPaise: fundNavs.navPaise, date: fundNavs.date })
    .from(fundNavs)
    .where(and(eq(fundNavs.fundId, fundId), eq(fundNavs.date, date)))
    .limit(1);
  return row ?? null;
}
