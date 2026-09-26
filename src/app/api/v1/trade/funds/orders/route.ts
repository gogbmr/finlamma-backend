import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { PlaceFundOrderResponseSchema, PlaceFundOrderSchema } from "@/server/fund-orders/schemas";
import { placeFundOrder } from "@/server/fund-orders/service";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "post",
  path: "/api/v1/trade/funds/orders",
  summary: "Buy (lump sum) or sell (redeem) fund units",
  description:
    "BUY takes an amountPaise (₹ to invest) and units are derived from the latest ingested " +
    "NAV; SELL takes a unitsMilli count to redeem. Requires an Idempotency-Key header - " +
    "retrying the exact same request with the same key returns the original result " +
    "(`replayed: true`). Always executes against the most recently ingested NAV, never a " +
    "client-sent price - the response always shows which NAV date/value was used, no hidden " +
    "pricing (docs/ARCHITECTURE.md D45/D46).",
  tags: ["Trade"],
  security: [{ bearerAuth: [] }],
  request: {
    headers: z.object({
      "Idempotency-Key": z.string().min(1).openapi({ description: "Client-generated, unique per order attempt." }),
    }),
    body: {
      content: {
        "application/json": {
          schema: PlaceFundOrderSchema,
          example: { fundId: "00000000-0000-0000-0000-000000000000", side: "buy", amountPaise: 10000 },
        },
      },
    },
  },
  responses: {
    200: {
      description: "The fund order (filled, or replayed from an identical earlier request)",
      content: { "application/json": { schema: PlaceFundOrderResponseSchema } },
    },
    400: {
      description: "Invalid input, a missing Idempotency-Key header, or below the fund's minimum lump sum",
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
      description: "No active fund with this id",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No fund with this id" } },
        },
      },
    },
    409: {
      description:
        "The order can't be placed right now - NAV_UNAVAILABLE, NAV_STALE, INSUFFICIENT_MARGIN, " +
        "INSUFFICIENT_HOLDINGS, or IDEMPOTENCY_REPLAY (the same key was reused for a different request)",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: {
              code: "INSUFFICIENT_MARGIN",
              message: "Not enough V Money for this investment",
              details: { balancePaise: 5000, requiredPaise: 10000 },
            },
          },
        },
      },
    },
  },
});

export const POST = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await requireFullAccess(user);

  const idempotencyKey = req.headers.get("Idempotency-Key");
  if (!idempotencyKey) {
    throw new AppError("VALIDATION_FAILED", "Idempotency-Key header is required");
  }

  const body = await req.json();
  const input = PlaceFundOrderSchema.parse(body);

  return ok(await placeFundOrder(user, input, idempotencyKey, requestMeta(req.headers)));
});
