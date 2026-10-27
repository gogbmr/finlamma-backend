import { DB_CONCURRENCY_LIMIT, runWithConcurrencyLimit } from "@/lib/concurrency-limit";
import { AppError } from "@/lib/errors";
import {
  getFundHoldingForUser,
  getLatestNav,
  getPublicFundById,
  listActiveFunds,
  listFundHoldingsForUser,
} from "./repo";
import { FUND_DISCLAIMER, FUND_DISCLAIMER_LOCALIZED } from "./schemas";

type Holding = { unitsMilli: number; avgNavPaise: number } | null;

// TR-38/39 (Phase 4 Trade asks): null (not 0) when the learner doesn't hold
// this fund at all - same "null means not applicable" convention
// instruments' `quote` already uses, rather than overloading 0 (a
// genuinely fully-redeemed holding would also be 0). `holdingValuePaise`
// is null whenever it can't be honestly priced - no holding, or a fund
// that's never been ingested a NAV yet - never a fabricated value.
function shapeHolding(holding: Holding, latestNav: { navPaise: number } | null) {
  if (!holding || holding.unitsMilli <= 0) {
    return { heldUnitsMilli: null, holdingValuePaise: null };
  }
  const holdingValuePaise = latestNav ? Math.round((holding.unitsMilli * latestNav.navPaise) / 1000) : null;
  return { heldUnitsMilli: holding.unitsMilli, holdingValuePaise };
}

async function shapeFund(
  fund: NonNullable<Awaited<ReturnType<typeof getPublicFundById>>>,
  holding: Holding,
) {
  const latestNav = await getLatestNav(fund.id);
  return { ...fund, latestNav, ...shapeHolding(holding, latestNav) };
}

// TR-35/38 (Explore mode) - every active fund with its latest ingested NAV
// AND this learner's own held units/holding value merged in (null/null if
// not held - see shapeHolding). Visible regardless of trading-unlock
// progress, same "browse is open, only placing money is gated" pattern as
// listPublicInstruments (src/server/market/service.ts) - actual buy/SIP
// creation is gated separately in src/server/fund-orders/service.ts.
// Chose to extend THIS endpoint (and getPublicFund below) rather than add
// a separate GET /me/portfolio/funds: it mirrors TR-18's own precedent for
// stocks (merge the holding into the instrument response, don't build a
// second near-duplicate positions endpoint), and /me/portfolio/* already
// covers aggregate cash/P&L/trade-history - a 4th portfolio endpoint here
// would just re-list the same funds this one already returns.
//
// runWithConcurrencyLimit, not a bare Promise.all (CLAUDE.md rule 15,
// docs/ARCHITECTURE.md D13/D72) - mapping every fund through shapeFund
// used to fan out one getLatestNav() query per seeded fund (9 of them)
// against the pool's max: 4, a real, previously undetected instance of
// the exact pattern that caused the D72 production incident, found during
// the Phase 4 Trade audit because the checker script didn't look inside
// a .map() over a runtime-length array yet (now fixed - see
// scripts/check-promise-all-db-concurrency.ts). The holdings lookup
// itself is ONE query for every fund this learner holds, not one per
// fund - see listFundHoldingsForUser.
export async function listPublicFunds(userId: string) {
  const [funds, holdings] = await runWithConcurrencyLimit(
    [() => listActiveFunds(), () => listFundHoldingsForUser(userId)],
    DB_CONCURRENCY_LIMIT,
  );
  const holdingByFundId = new Map(holdings.map((h) => [h.fundId, h]));
  const data = await runWithConcurrencyLimit(
    funds.map((f) => () => shapeFund(f, holdingByFundId.get(f.id) ?? null)),
    DB_CONCURRENCY_LIMIT,
  );
  return { data, disclaimer: FUND_DISCLAIMER, disclaimerLocalized: FUND_DISCLAIMER_LOCALIZED };
}

// App asks batch, item A2 - same concurrency-limited fan-out pattern as
// listPublicFunds above (one getLatestNav call per DISTINCT held fund,
// never a bare Promise.all, CLAUDE.md rule 15).
export async function getFundFolioSummary(userId: string) {
  const holdings = (await listFundHoldingsForUser(userId)).filter((h) => h.unitsMilli > 0);
  const navs = await runWithConcurrencyLimit(
    holdings.map((h) => () => getLatestNav(h.fundId)),
    DB_CONCURRENCY_LIMIT,
  );

  let totalInvestedPaise = 0;
  let totalCurrentValuePaise = 0;
  holdings.forEach((holding, i) => {
    const investedPaise = Math.round((holding.unitsMilli * holding.avgNavPaise) / 1000);
    totalInvestedPaise += investedPaise;
    const nav = navs[i];
    // A fund never ingested a NAV yet contributes its cost basis (zero
    // gain/loss for that one holding) rather than being dropped from the
    // total or given a fabricated current value.
    totalCurrentValuePaise += nav ? Math.round((holding.unitsMilli * nav.navPaise) / 1000) : investedPaise;
  });

  const overallReturnsPaise = totalCurrentValuePaise - totalInvestedPaise;
  const overallReturnsPercent =
    totalInvestedPaise > 0 ? Number(((overallReturnsPaise / totalInvestedPaise) * 100).toFixed(2)) : 0;

  return { data: { totalInvestedPaise, totalCurrentValuePaise, overallReturnsPaise, overallReturnsPercent } };
}

export async function getPublicFund(id: string, userId: string) {
  const fund = await getPublicFundById(id);
  if (!fund || !fund.active) throw new AppError("NOT_FOUND", "No fund with this id");
  const holding = await getFundHoldingForUser(userId, id);
  return {
    data: await shapeFund(fund, holding),
    disclaimer: FUND_DISCLAIMER,
    disclaimerLocalized: FUND_DISCLAIMER_LOCALIZED,
  };
}
