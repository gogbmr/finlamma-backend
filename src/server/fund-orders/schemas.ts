import { z } from "zod";
// Side-effect import: registers Zod's .openapi() extension method - see
// src/lib/openapi.ts.
import "@/lib/openapi";
import { registry } from "@/lib/openapi";

// Fat-finger guards, not product limits - same reasoning as
// src/server/orders/schemas.ts's MAX_ORDER_QTY.
export const MAX_FUND_AMOUNT_PAISE = 10_000_000_00; // ₹1 crore
export const MAX_FUND_UNITS_MILLI = 1_000_000_000; // 1,000,000.000 units

// Idempotency-Key is a required HTTP header (CLAUDE.md rule 3), never a
// body field. BUY takes an amount (₹ to invest, units are derived from the
// NAV at fill time); SELL takes a unit count to redeem (D45) - the two
// sides genuinely take different inputs, so this is a discriminated union
// rather than one schema with optional fields for both.
export const BuyFundSchema = z.object({
  fundId: z.uuid(),
  side: z.literal("buy"),
  amountPaise: z.number().int().positive().max(MAX_FUND_AMOUNT_PAISE),
});
export type BuyFundInput = z.infer<typeof BuyFundSchema>;

export const SellFundSchema = z.object({
  fundId: z.uuid(),
  side: z.literal("sell"),
  unitsMilli: z.number().int().positive().max(MAX_FUND_UNITS_MILLI),
});
export type SellFundInput = z.infer<typeof SellFundSchema>;

export const PlaceFundOrderSchema = z.discriminatedUnion("side", [BuyFundSchema, SellFundSchema]);
export type PlaceFundOrderInput = z.infer<typeof PlaceFundOrderSchema>;

const FundOrderPublicSchema = z.object({
  id: z.uuid(),
  fundId: z.uuid(),
  side: z.enum(["buy", "sell"]),
  status: z.enum(["filled", "failed"]),
  amountPaise: z.number().int().nullable().openapi({ description: "The ₹ that actually moved. null only for a failed SIP execution." }),
  unitsMilli: z.number().int().nullable().openapi({ description: "Units x 1000 (3 decimal places, D45)." }),
  navPaise: z.number().int().nullable().openapi({ description: "The exact NAV this fill used - never hidden pricing." }),
  navDate: z.string().nullable().openapi({ description: "Which NAV date was used, e.g. \"2026-09-25\"." }),
  realizedPnlPaise: z.number().int().nullable(),
  createdAt: z.string().datetime(),
});

export const PlaceFundOrderResponseSchema = registry.register(
  "PlaceFundOrderResponse",
  z.object({
    data: FundOrderPublicSchema.extend({
      replayed: z.boolean().openapi({
        description: "True only when this exact response is a replay of an already-processed request with the same Idempotency-Key.",
      }),
    }),
  }),
);
