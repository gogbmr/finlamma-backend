import { z } from "zod";
// Side-effect import: registers Zod's .openapi() extension method - see
// src/lib/openapi.ts. Must be imported before any .openapi() call below.
import "@/lib/openapi";
import { registry } from "@/lib/openapi";

// A fat-finger guard, not a product limit - same reasoning as every other
// MAX_* bound in this codebase (e.g. src/server/economy/schemas.ts's
// MAX_REWARD_AMOUNT). Whole shares only (CLAUDE.md, trading-rules skill) -
// no fractional/amount-based orders.
export const MAX_ORDER_QTY = 100_000;

// Idempotency-Key is a required HTTP header (CLAUDE.md rule 3), never a
// body field - validated separately by the route handler, not this schema.
export const PlaceOrderSchema = z
  .object({
    symbol: z
      .string()
      .regex(/^[A-Z][A-Z0-9]*$/, "symbol must be uppercase letters/digits only, e.g. RELIANCE"),
    side: z.enum(["buy", "sell"]),
    type: z.enum(["market", "limit"]),
    qty: z.number().int().positive().max(MAX_ORDER_QTY),
    // Required for LIMIT, forbidden for MARKET - enforced below, not by
    // making this field itself required, since its presence depends on
    // `type`.
    limitPricePaise: z.number().int().positive().optional(),
  })
  .refine((input) => (input.type === "limit" ? input.limitPricePaise !== undefined : true), {
    message: "limitPricePaise is required for a limit order",
    path: ["limitPricePaise"],
  })
  .refine((input) => (input.type === "market" ? input.limitPricePaise === undefined : true), {
    message: "limitPricePaise must be omitted for a market order",
    path: ["limitPricePaise"],
  });
export type PlaceOrderInput = z.infer<typeof PlaceOrderSchema>;

const OrderPublicSchema = z.object({
  id: z.uuid(),
  symbol: z.string().openapi({ example: "RELIANCE" }),
  side: z.enum(["buy", "sell"]),
  type: z.enum(["market", "limit"]),
  qty: z.number().int(),
  limitPricePaise: z.number().int().nullable(),
  status: z.enum(["open", "filled", "cancelled"]),
  fillPricePaise: z.number().int().nullable(),
  createdAt: z.string().datetime(),
  filledAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
});

export const PlaceOrderResponseSchema = registry.register(
  "PlaceOrderResponse",
  z.object({
    data: OrderPublicSchema.extend({
      // True only when this exact response is a replay of an
      // already-processed request with the same Idempotency-Key - never
      // true for a genuinely new order, even if it happens to end up
      // "open" rather than "filled".
      replayed: z.boolean(),
    }),
  }),
);

export const OrderListResponseSchema = registry.register(
  "OrderListResponse",
  z.object({ data: z.array(OrderPublicSchema), nextCursor: z.string().nullable() }),
);
