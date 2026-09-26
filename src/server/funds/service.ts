import { AppError } from "@/lib/errors";
import { getLatestNav, getPublicFundById, listActiveFunds } from "./repo";
import { FUND_DISCLAIMER } from "./schemas";

async function shapeFund(fund: NonNullable<Awaited<ReturnType<typeof getPublicFundById>>>) {
  const latestNav = await getLatestNav(fund.id);
  return { ...fund, latestNav };
}

// TR-35/38 (Explore mode) - every active fund with its latest ingested NAV
// merged in. Visible regardless of trading-unlock progress, same "browse is
// open, only placing money is gated" pattern as listPublicInstruments
// (src/server/market/service.ts) - actual buy/SIP creation is gated
// separately in src/server/fund-orders/service.ts.
export async function listPublicFunds() {
  const funds = await listActiveFunds();
  const data = await Promise.all(funds.map(shapeFund));
  return { data, disclaimer: FUND_DISCLAIMER };
}

export async function getPublicFund(id: string) {
  const fund = await getPublicFundById(id);
  if (!fund || !fund.active) throw new AppError("NOT_FOUND", "No fund with this id");
  return { data: await shapeFund(fund), disclaimer: FUND_DISCLAIMER };
}
