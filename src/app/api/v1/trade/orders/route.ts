import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ok, okList, parseLimit, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import {
  ListOrdersQuerySchema,
  ListOrdersStatusEnum,
  OrderListResponseSchema,
  PlaceOrderResponseSchema,
  PlaceOrderSchema,
} from "@/server/orders/schemas";
import { listMyOrders, placeOrder } from "@/server/orders/service";

registry.registerPath({
  method: "post",
  path: "/api/v1/trade/orders",
  summary: "Place an order (TR-30)",
  description:
    "MARKET or LIMIT, BUY or SELL, whole shares only. Requires an Idempotency-Key header - " +
    "retrying the exact same request with the same key returns the original result " +
    "(`replayed: true`), never a second order; reusing the key with a different request is " +
    "rejected. The execution price always comes from the market relay's live tick in Redis, " +
    "never a client-sent price (CLAUDE.md, trading-rules skill) - see " +
    "docs/ARCHITECTURE.md D40/D41 for the full pricing and rejection-reason design. A LIMIT " +
    "order that isn't immediately marketable is queued (`status: \"open\"`) rather than filled - " +
    "Checkpoint 6's matching job fills it later, or cancels it at day end if the market closes " +
    "first.",
  tags: ["Trade"],
  security: [{ bearerAuth: [] }],
  request: {
    headers: z.object({
      "Idempotency-Key": z.string().min(1).openapi({ description: "Client-generated, unique per order attempt." }),
    }),
    body: {
      content: {
        "application/json": {
          schema: PlaceOrderSchema,
          example: { symbol: "RELIANCE", side: "buy", type: "market", qty: 1 },
        },
      },
    },
  },
  responses: {
    200: {
      description: "The order (filled, queued as open, or replayed from an identical earlier request)",
      content: { "application/json": { schema: PlaceOrderResponseSchema } },
    },
    400: {
      description: "Invalid input, or a missing Idempotency-Key header",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "VALIDATION_FAILED", message: "Idempotency-Key header is required" } },
        },
      },
    },
    401: {
      description: "Not signed in",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "UNAUTHENTICATED", message: "Sign-in required" } },
        },
      },
    },
    403: {
      description: "Onboarding incomplete, or trading isn't unlocked yet for this learner",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "FORBIDDEN", message: "Trading is locked until you clear more worlds" } },
        },
      },
    },
    404: {
      description: "No active instrument with this symbol",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No instrument with this symbol" } },
        },
      },
    },
    409: {
      description:
        "The order can't be placed right now - MARKET_CLOSED, MARKET_HALTED, SYMBOL_HALTED, " +
        "MARKET_PAUSED, PRICE_STALE, PRICE_UNAVAILABLE, INSUFFICIENT_MARGIN, " +
        "INSUFFICIENT_HOLDINGS, or IDEMPOTENCY_REPLAY (the same key was reused for a different request)",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: {
              code: "INSUFFICIENT_MARGIN",
              message: "Not enough V Money for this order",
              details: { balancePaise: 10000, requiredPaise: 28451000 },
            },
          },
        },
      },
    },
    429: {
      description: "Too many order attempts, or the rate limiter couldn't be reached (fails closed)",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: { code: "RATE_LIMITED", message: "Too many order attempts - slow down and try again shortly" },
          },
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/trade/orders",
  summary: "My own order history (TR-13)",
  description:
    "Every status included - open, filled, cancelled (with `cancelReason` distinguishing the " +
    "learner's own cancel from the end-of-day auto-cancel). No 'rejected' status exists " +
    "(docs/ARCHITECTURE.md D41) - a rejected order attempt is a thrown error at request time, " +
    "never a row here. `idempotencyKey` lets the app resolve an \"outcome unknown\" attempt " +
    "(e.g. a request that timed out client-side) by looking up the exact key it sent - this is " +
    "always scoped to the caller's own orders, so it can never surface another learner's order " +
    "even with a guessed key. Cursor-paginated newest first, same (createdAt, id) stable-cursor " +
    "shape as GET /me/portfolio/trades.",
  tags: ["Trade"],
  security: [{ bearerAuth: [] }],
  request: { query: ListOrdersQuerySchema },
  responses: {
    200: {
      description: "A page of the caller's own orders",
      content: { "application/json": { schema: OrderListResponseSchema } },
    },
    400: {
      description: "Invalid status, limit or cursor",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "VALIDATION_FAILED", message: "Invalid cursor" } },
        },
      },
    },
    401: {
      description: "Not signed in",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "UNAUTHENTICATED", message: "Sign-in required" } },
        },
      },
    },
    403: {
      description: "Onboarding, parental consent or legal acceptance is incomplete",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: { code: "FORBIDDEN", message: "Complete onboarding before using this feature" },
          },
        },
      },
    },
  },
});

export const GET = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await requireFullAccess(user);

  const { searchParams } = new URL(req.url);
  const statusRaw = searchParams.get("status");
  const status = statusRaw ? ListOrdersStatusEnum.parse(statusRaw) : undefined;
  const idempotencyKey = searchParams.get("idempotencyKey") ?? undefined;
  const limit = parseLimit(searchParams.get("limit"));

  const { data, nextCursor } = await listMyOrders(user.id, {
    status,
    idempotencyKey,
    limit,
    cursor: searchParams.get("cursor"),
  });
  return okList(data, nextCursor);
});

export const POST = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await requireFullAccess(user);

  const idempotencyKey = req.headers.get("Idempotency-Key");
  if (!idempotencyKey) {
    throw new AppError("VALIDATION_FAILED", "Idempotency-Key header is required");
  }

  const body = await req.json();
  const input = PlaceOrderSchema.parse(body);

  return ok(await placeOrder(user, input, idempotencyKey, requestMeta(req.headers)));
});
