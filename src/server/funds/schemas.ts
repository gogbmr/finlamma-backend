import { z } from "zod";
// Side-effect import: registers Zod's .openapi() extension method - see
// src/lib/openapi.ts.
import "@/lib/openapi";

// D45 (docs/ARCHITECTURE.md) - fund-accurate version of market/schemas.ts's
// TRADING_DISCLAIMER: NAVs are real AMFI data (tracked internally, never
// shown by real scheme name - see the fund names below), never real-money
// investment advice.
export const FUND_DISCLAIMER =
  "NAV data reflects real mutual fund market movement, used for virtual practice only. " +
  "Investments here use V Money, never real rupees. Nothing on this screen is investment advice.";

// Phase 4 Trade asks (2026-10-20), additive: a {en, hi, hx} version of
// FUND_DISCLAIMER, returned alongside the existing plain-string field
// (never replacing it). Hindi/Hinglish copy is a best-effort draft, not
// yet reviewed by a native speaker (docs/ROADMAP.md's pre-launch checklist).
export const FUND_DISCLAIMER_LOCALIZED = {
  en: FUND_DISCLAIMER,
  hi: "NAV डेटा असली म्यूचुअल फंड बाज़ार की हलचल दिखाता है, सिर्फ़ वर्चुअल अभ्यास के लिए। " +
    "यहाँ निवेश V Money से होते हैं, असली रुपयों से नहीं। इस स्क्रीन पर कुछ भी निवेश सलाह नहीं है।",
  hx: "NAV data real mutual fund market movement dikhaata hai, sirf virtual practice ke liye. " +
    "Yahaan investments V Money se hote hain, real rupees se nahi. Is screen par kuch bhi investment advice nahi hai.",
};

const LocalizedTextSchema = z.object({ en: z.string(), hi: z.string(), hx: z.string() });

// D45: never includes amfiSchemeCode - that field is internal-only and
// never leaves the server (src/server/funds/repo.ts's PUBLIC_FUND_COLUMNS
// is the actual enforcement; this schema is what the OpenAPI contract
// documents as the honest, complete response shape).
const PublicFundSchema = z.object({
  id: z.uuid(),
  name: z.string().openapi({ example: "Finlamma Nifty 50 Index Fund" }),
  category: z.enum(["index", "equity", "hybrid", "debt", "elss"]),
  risk: z.enum(["very_low", "low", "moderate", "high", "very_high"]),
  description: LocalizedTextSchema,
  expenseRatioBps: z.number().int().nonnegative().openapi({
    description: "Illustrative, typical-for-this-fund-type expense ratio in basis points (100 = 1%) - not a real scheme's own filed rate.",
    example: 20,
  }),
  minLumpSumPaise: z.number().int().positive().openapi({ example: 10000 }),
  minSipPaise: z.number().int().positive().openapi({ example: 10000 }),
  latestNav: z
    .object({
      navPaise: z.number().int().positive().openapi({ example: 1629607 }),
      date: z.string().openapi({ example: "2026-09-25" }),
    })
    .nullable()
    .openapi({ description: "null if this fund has never been ingested yet." }),
  heldUnitsMilli: z.number().int().positive().nullable().openapi({
    description: "This learner's own held units x 1000 (3 decimal places, D45). null if they don't hold this fund at all.",
    example: 12500,
  }),
  holdingValuePaise: z.number().int().nonnegative().nullable().openapi({
    description:
      "heldUnitsMilli valued at latestNav, in paise. null whenever it can't be honestly priced " +
      "- not held, or latestNav itself is null (never ingested yet).",
    example: 203700,
  }),
});

const FUND_DISCLAIMER_LOCALIZED_SHAPE = {
  disclaimer: z.string().openapi({ example: FUND_DISCLAIMER }),
  disclaimerLocalized: LocalizedTextSchema.openapi({ example: FUND_DISCLAIMER_LOCALIZED }),
};

export const FundListResponseSchema = z.object({
  data: z.array(PublicFundSchema),
  ...FUND_DISCLAIMER_LOCALIZED_SHAPE,
});

export const FundDetailResponseSchema = z.object({
  data: PublicFundSchema,
  ...FUND_DISCLAIMER_LOCALIZED_SHAPE,
});
