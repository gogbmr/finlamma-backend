import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { MarketStatusResponseSchema } from "@/server/market/schemas";
import { getMarketStatus } from "@/server/market/service";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/trade/market-status",
  summary: "Get market status and this learner's trading-unlock progress (TR-01/34/57)",
  description:
    "Whether NSE is open right now, the Ops console's feed mode and global halt state, and " +
    "whether this learner has unlocked the order pad - with a worldsToGo progress count when " +
    "not yet unlocked (D25: position-based, never a specific world's id/name). Explore mode " +
    "(quotes/charts/watchlist) stays visible regardless of this - only placing an order is gated.",
  tags: ["Trade"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Current market status",
      content: { "application/json": { schema: MarketStatusResponseSchema } },
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
  return ok(await getMarketStatus(user.id));
});
