import type { LocalizedText } from "@/db/schema/_helpers";

// Phase 4 Trade asks (2026-10-20): a {en, hi, hx} version of the plain
// `reason` text written to vmoney_ledger for a fund trade/SIP fill
// (src/server/fund-orders/repo.ts's placeFundOrderTx,
// src/server/fund-orders/sip-service.ts's execution job). Built at write
// time - see src/server/orders/i18n.ts's comment for why. Hindi/Hinglish
// copy here is a best-effort draft, not yet reviewed by a native speaker
// (docs/ROADMAP.md's pre-launch checklist).
export function buildFundOrderReasonLocalized(
  side: "buy" | "sell",
  navPaise: number,
  navDate: string,
  isSip: boolean = false,
): LocalizedText {
  const navRupees = (navPaise / 100).toFixed(2);
  // "SIP:" stays as-is in every language, same treatment the instrument
  // symbol gets in src/server/orders/i18n.ts - a recognizable label, not
  // translated prose.
  const sipPrefix = isSip ? "SIP: " : "";
  return side === "buy"
    ? {
        en: `${sipPrefix}Bought fund units @ NAV ₹${navRupees} (${navDate})`,
        hi: `${sipPrefix}₹${navRupees} NAV (${navDate}) पर फंड यूनिट खरीदी`,
        hx: `${sipPrefix}Fund units ₹${navRupees} NAV (${navDate}) mein khareedi`,
      }
    : {
        en: `${sipPrefix}Sold fund units @ NAV ₹${navRupees} (${navDate})`,
        hi: `${sipPrefix}₹${navRupees} NAV (${navDate}) पर फंड यूनिट बेची`,
        hx: `${sipPrefix}Fund units ₹${navRupees} NAV (${navDate}) mein bechi`,
      };
}
