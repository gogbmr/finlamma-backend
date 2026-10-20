import type { LocalizedText } from "@/db/schema/_helpers";

// Phase 4 Trade asks (2026-10-20): a {en, hi, hx} version of the plain
// `reason` text written to vmoney_ledger for a stock trade fill
// (src/server/orders/repo.ts's placeOrderTx/matchOpenLimitOrderTx). Built
// at write time, not reconstructed later from sourceId - the symbol/qty/
// price are already known, type-safe values right here, so there's no
// need to re-join back to the `orders` row at read time. The instrument
// symbol is kept in Latin script in every language (same convention
// scripts/seed-instruments.ts's own hi/hx copy already uses for company
// names - a stock ticker is a proper noun, not translated). Hindi/Hinglish
// copy here is a best-effort draft, same caveat as every other hi/hx
// string seeded during development (docs/ROADMAP.md's pre-launch
// checklist "Native-speaker review of all Hindi and Hinglish content") -
// not yet reviewed by a native speaker.
export function buildTradeReasonLocalized(
  side: "buy" | "sell",
  qty: number,
  symbol: string,
  fillPricePaise: number,
): LocalizedText {
  const rupees = (fillPricePaise / 100).toFixed(2);
  return side === "buy"
    ? {
        en: `Bought ${qty} ${symbol} @ ₹${rupees}`,
        hi: `₹${rupees} पर ${symbol} के ${qty} शेयर खरीदे`,
        hx: `${symbol} ke ${qty} shares ₹${rupees} mein khareede`,
      }
    : {
        en: `Sold ${qty} ${symbol} @ ₹${rupees}`,
        hi: `₹${rupees} पर ${symbol} के ${qty} शेयर बेचे`,
        hx: `${symbol} ke ${qty} shares ₹${rupees} mein beche`,
      };
}
