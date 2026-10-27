import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ok, okList, parseLimit, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { listMyCompetitionTrades, placeCompetitionTrade } from "@/server/competitions/service";
import {
  CompetitionTradeListResponseSchema,
  CompetitionTradeResponseSchema,
  ListCompetitionTradesQuerySchema,
  PlaceCompetitionTradeRequestSchema,
} from "@/server/competitions/schemas";

registry.registerPath({
  method: "post",
  path: "/api/v1/arena/competitions/current/trades",
  summary: "Place a trade inside the current Monthly Competition (AR-14)",
  description:
    "MARKET-only, whole shares, against the competition's single fixed instrument and the " +
    "caller's own isolated entry - never the real order book, `holdings` or `vmoney_ledger` " +
    "(docs/ARCHITECTURE.md D57). Requires an Idempotency-Key header, same convention as real " +
    "orders. Rejected the same way a real order is for market/symbol halts, a paused feed, a " +
    "closed market, or a stale/unavailable price (never a different, looser price path for the " +
    "sandbox) - plus a competition-specific max-trades limit (settings_kv, default 10).",
  tags: ["Arena"],
  security: [{ bearerAuth: [] }],
  request: {
    headers: z.object({
      "Idempotency-Key": z.string().min(1).openapi({ description: "Client-generated, unique per trade attempt." }),
    }),
    body: {
      content: {
        "application/json": { schema: PlaceCompetitionTradeRequestSchema, example: { side: "buy", qty: 5 } },
      },
    },
  },
  responses: {
    200: {
      description: "The trade (filled, or replayed from an identical earlier request)",
      content: { "application/json": { schema: CompetitionTradeResponseSchema } },
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
      description: "Onboarding incomplete, or the caller hasn't entered this competition",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "FORBIDDEN", message: "Enter the competition before trading in it" } },
        },
      },
    },
    404: {
      description: "No active competition right now",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No active competition right now" } },
        },
      },
    },
    409: {
      description:
        "Market/symbol halted, feed paused, market closed, price stale/unavailable, the " +
        "max-trades limit reached, or insufficient cash/holdings",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "COMPETITION_MAX_TRADES_REACHED", message: "You've reached the 10-trade limit for this competition" } },
        },
      },
    },
    429: {
      description: "Too many trade attempts, or the rate limiter couldn't be reached (fails closed)",
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
  path: "/api/v1/arena/competitions/current/trades",
  summary: "My own trades in the current Monthly Competition (app ask A11)",
  description:
    "Same semantics as GET /trade/orders?idempotencyKey= - cursor-paginated newest first, " +
    "scoped to the caller's own entry in the currently active competition. `idempotencyKey` " +
    "lets the app resolve an \"outcome unknown\" trade attempt by looking up the exact key it " +
    "sent; a guessed key can never surface another learner's trade.",
  tags: ["Arena"],
  security: [{ bearerAuth: [] }],
  request: { query: ListCompetitionTradesQuerySchema },
  responses: {
    200: {
      description: "A page of the caller's own trades in the current competition",
      content: { "application/json": { schema: CompetitionTradeListResponseSchema } },
    },
    400: {
      description: "Invalid limit or cursor",
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
      description: "Onboarding incomplete, or the caller hasn't entered this competition",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "FORBIDDEN", message: "Enter the competition before trading in it" } },
        },
      },
    },
    404: {
      description: "No active competition right now",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No active competition right now" } },
        },
      },
    },
  },
});

export const GET = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await requireFullAccess(user);

  const { searchParams } = new URL(req.url);
  const idempotencyKey = searchParams.get("idempotencyKey") ?? undefined;
  const limit = parseLimit(searchParams.get("limit"));

  const { data, nextCursor } = await listMyCompetitionTrades(user, {
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

  const input = PlaceCompetitionTradeRequestSchema.parse(await req.json());
  return ok(await placeCompetitionTrade(user, input, idempotencyKey, requestMeta(req.headers)));
});
