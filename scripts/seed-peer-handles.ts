// Seeds the initial peer_handles catalog (D73, docs/ARCHITECTURE.md) - the
// staff-curated identities every learner is randomly assigned, shown to
// other learners everywhere firstName/lastInitial used to appear. Themed,
// kid-friendly and finance-flavoured; deliberately nothing mocking,
// gendered or identity-revealing. `hx` mirrors `hi`'s convention for short
// names elsewhere in this codebase (seed-worlds.ts, seed-mentors.ts) - the
// same Latin-script name, not a translation. Idempotent by key - never
// overwrites `name`/`active` on conflict, so re-running this after staff
// have edited a handle via the admin editor doesn't silently reset it. Run
// via `pnpm seed:peer-handles`.
import "../envConfig";
import { db } from "../src/db/client";
import { peerHandles } from "../src/db/schema";

const HANDLES = [
  { key: "smart-saver", en: "Smart Saver", hi: "स्मार्ट सेवर" },
  { key: "bright-bull", en: "Bright Bull", hi: "ब्राइट बुल" },
  { key: "golden-piggy", en: "Golden Piggy", hi: "गोल्डन पिगी" },
  { key: "lucky-rupee", en: "Lucky Rupee", hi: "लकी रुपी" },
  { key: "clever-coin", en: "Clever Coin", hi: "क्लेवर कॉइन" },
  { key: "wise-owl", en: "Wise Owl", hi: "वाइज़ आउल" },
  { key: "bold-investor", en: "Bold Investor", hi: "बोल्ड इन्वेस्टर" },
  { key: "steady-saver", en: "Steady Saver", hi: "स्टेडी सेवर" },
  { key: "shiny-rupee", en: "Shiny Rupee", hi: "शाइनी रुपी" },
  { key: "happy-trader", en: "Happy Trader", hi: "हैप्पी ट्रेडर" },
  { key: "brave-bull", en: "Brave Bull", hi: "ब्रेव बुल" },
  { key: "quick-calculator", en: "Quick Calculator", hi: "क्विक कैलकुलेटर" },
  { key: "sharp-saver", en: "Sharp Saver", hi: "शार्प सेवर" },
  { key: "future-founder", en: "Future Founder", hi: "फ्यूचर फाउंडर" },
  { key: "rising-star-saver", en: "Rising Star Saver", hi: "राइज़िंग स्टार सेवर" },
  { key: "piggy-bank-pro", en: "Piggy Bank Pro", hi: "पिगी बैंक प्रो" },
  { key: "budget-buddy", en: "Budget Buddy", hi: "बजट बडी" },
  { key: "coin-collector", en: "Coin Collector", hi: "कॉइन कलेक्टर" },
  { key: "market-maven", en: "Market Maven", hi: "मार्केट मेवन" },
  { key: "penny-wise", en: "Penny Wise", hi: "पेनी वाइज़" },
  { key: "gold-rush-saver", en: "Gold Rush Saver", hi: "गोल्ड रश सेवर" },
  { key: "treasure-tracker", en: "Treasure Tracker", hi: "ट्रेज़र ट्रैकर" },
  { key: "rupee-ranger", en: "Rupee Ranger", hi: "रुपी रेंजर" },
  { key: "trade-titan", en: "Trade Titan", hi: "ट्रेड टाइटन" },
  { key: "stock-sprout", en: "Stock Sprout", hi: "स्टॉक स्प्राउट" },
  { key: "vault-voyager", en: "Vault Voyager", hi: "वॉल्ट वॉयजर" },
  { key: "thrifty-tiger", en: "Thrifty Tiger", hi: "थ्रिफ्टी टाइगर" },
  { key: "savvy-squirrel", en: "Savvy Squirrel", hi: "सैवी स्क्विरल" },
  { key: "nest-egg-ninja", en: "Nest Egg Ninja", hi: "नेस्ट एग निंजा" },
  { key: "budget-boss", en: "Budget Boss", hi: "बजट बॉस" },
  { key: "interest-idol", en: "Interest Idol", hi: "इंटरेस्ट आइडल" },
  { key: "profit-pioneer", en: "Profit Pioneer", hi: "प्रॉफिट पायनियर" },
  { key: "dividend-dreamer", en: "Dividend Dreamer", hi: "डिविडेंड ड्रीमर" },
  { key: "capital-captain", en: "Capital Captain", hi: "कैपिटल कैप्टन" },
  { key: "ledger-legend", en: "Ledger Legend", hi: "लेजर लीजेंड" },
  { key: "wallet-wizard", en: "Wallet Wizard", hi: "वॉलेट विज़ार्ड" },
  { key: "finance-falcon", en: "Finance Falcon", hi: "फाइनेंस फाल्कन" },
  { key: "asset-ace", en: "Asset Ace", hi: "एसेट ऐस" },
  { key: "equity-eagle", en: "Equity Eagle", hi: "इक्विटी ईगल" },
  { key: "rally-runner", en: "Rally Runner", hi: "रैली रनर" },
] as const;

async function seed() {
  for (const handle of HANDLES) {
    await db
      .insert(peerHandles)
      .values({
        key: handle.key,
        name: { en: handle.en, hi: handle.hi, hx: handle.en },
        active: true,
      })
      .onConflictDoNothing({ target: peerHandles.key });
  }
  console.log(`Seeded ${HANDLES.length} peer handle(s) (existing rows, if any, were left untouched).`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
