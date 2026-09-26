import { z } from "zod";

// Checkpoint 9 (docs/ARCHITECTURE.md D47/D48) - admin-editable risk-flag
// thresholds, trading.ops-gated, never hardcoded in the flag computation
// itself (src/server/ops/service.ts's computeRiskFlag). Fat-finger upper
// bounds, not product limits, same reasoning as every other MAX_* bound in
// this codebase.
export const RiskThresholdsSchema = z.object({
  // NEW: the account was created fewer than this many days ago.
  newAccountDays: z.number().int().positive().max(90),
  // WATCH: the single largest position (a stock holding or a fund holding)
  // is more than this % of the learner's total account value (cash +
  // holdings market value).
  concentrationPct: z.number().positive().max(100),
  // WATCH: more than this many orders (stock + fund combined) placed today
  // (IST calendar day).
  dailyOrderCount: z.number().int().positive().max(1000),
});
export type RiskThresholds = z.infer<typeof RiskThresholdsSchema>;

// The exact rule stated to the founder: NEW = joined < 7 days ago; WATCH =
// >50% of portfolio in one position OR >10 orders in a day; OK = otherwise.
export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  newAccountDays: 7,
  concentrationPct: 50,
  dailyOrderCount: 10,
};

export const RISK_THRESHOLDS_SETTINGS_KEY = "trading_risk_thresholds";

export type RiskFlag = "new" | "watch" | "ok";
