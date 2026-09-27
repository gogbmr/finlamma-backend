import { getOrCreateMarketControls, listActiveInstruments, listMarketHolidays } from "@/server/trading/repo";

// GET /api/v1/relay/config - aggregates exactly what the relay needs
// (which symbols to track, whether the feed is paused, per-symbol/global
// halt state, and the holiday calendar) from the same trading-domain
// tables the admin editor and the app's own market-status endpoint
// already read. No activity log entry - this is a read with no side
// effect, called automatically and repeatedly by a machine, not a staff
// or learner action worth auditing (same reasoning as GET /api/v1/health).
export async function getRelayConfig() {
  const [instruments, controls, holidays] = await Promise.all([
    listActiveInstruments(),
    getOrCreateMarketControls(),
    listMarketHolidays(),
  ]);

  return {
    instruments: instruments.map((i) => ({ symbol: i.symbol, exchange: i.exchange, halted: i.halted })),
    feedMode: controls.feedMode,
    globalHalt: controls.globalHalt,
    holidays: holidays.map((h) => h.date),
  };
}
