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
  cancelReason: z.enum(["user_requested", "eod_expired"]).nullable().openapi({
    description:
      "Why a cancelled order was cancelled - the learner's own cancel, or the end-of-day " +
      "auto-cancel job. null for any order that isn't cancelled, and for orders cancelled " +
      "before this field existed. No 'rejected' status exists (docs/ARCHITECTURE.md D41) - a " +
      "rejection is a thrown error at request time, never a row in this list.",
    example: null,
  }),
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

export const CancelOrderResponseSchema = registry.register(
  "CancelOrderResponse",
  z.object({ data: OrderPublicSchema }),
);

// TR-13: filter query params for GET /trade/orders.
export const ListOrdersStatusEnum = z.enum(["open", "filled", "cancelled"]);
export type ListOrdersStatus = z.infer<typeof ListOrdersStatusEnum>;

export const ListOrdersQuerySchema = z.object({
  status: ListOrdersStatusEnum.optional().openapi({
    description: "Omit to return every status.",
    example: "open",
  }),
  // Lets the app resolve an "outcome unknown" order attempt (e.g. the
  // request timed out client-side after actually reaching the server) by
  // looking up the exact Idempotency-Key it sent - never another
  // learner's, since this is always combined with the caller's own userId
  // (src/server/orders/repo.ts's listOrdersForUserPage).
  idempotencyKey: z.string().min(1).optional(),
  limit: z.string().optional().openapi({ example: "20" }),
  cursor: z.string().optional(),
});
