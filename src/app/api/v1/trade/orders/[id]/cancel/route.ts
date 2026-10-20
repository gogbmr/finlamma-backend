import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { CancelOrderResponseSchema } from "@/server/orders/schemas";
import { cancelMyOrder } from "@/server/orders/service";

const OrderIdParamSchema = z.object({ id: z.uuid() });

registry.registerPath({
  method: "post",
  path: "/api/v1/trade/orders/{id}/cancel",
  summary: "Cancel a pending order",
  description:
    "Only ever cancels the caller's own order - an id that doesn't exist, or belongs to another " +
    "learner, returns a plain 404 (never 403), so an order id can't be probed to learn whether it " +
    "exists. No V Money is released: a queued (`status: \"open\"`) order was never debited in the " +
    "first place (CLAUDE.md, trading-rules skill) - margin is only ever checked and charged at the " +
    "moment of an actual fill, never reserved ahead of it. Calling this again on an order you " +
    "already cancelled is an idempotent success (the current row, unchanged). An order that has " +
    "already filled, or already expired at end-of-day, can't be cancelled - `ORDER_NOT_CANCELLABLE` " +
    "names its current status.",
  tags: ["Trade"],
  security: [{ bearerAuth: [] }],
  request: { params: OrderIdParamSchema },
  responses: {
    200: {
      description: "Cancelled (or already cancelled)",
      content: { "application/json": { schema: CancelOrderResponseSchema } },
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
    404: {
      description: "No order with this id (including one that belongs to another learner)",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No order with this id" } },
        },
      },
    },
    409: {
      description: "The order has already filled, or already expired at end-of-day",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: {
              code: "ORDER_NOT_CANCELLABLE",
              message: "Cannot cancel an order that is already filled",
              details: { status: "filled" },
            },
          },
        },
      },
    },
  },
});

export const POST = withErrors(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser(req);
    await requireFullAccess(user);
    const { id } = OrderIdParamSchema.parse(await params);
    return ok(await cancelMyOrder(user.id, id, requestMeta(req.headers)));
  },
);
