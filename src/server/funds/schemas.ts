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
});

export const FundListResponseSchema = z.object({
  data: z.array(PublicFundSchema),
  disclaimer: z.string().openapi({ example: FUND_DISCLAIMER }),
});

export const FundDetailResponseSchema = z.object({
  data: PublicFundSchema,
  disclaimer: z.string().openapi({ example: FUND_DISCLAIMER }),
});
