import { requireUser } from "@/lib/auth";
import { okWithDisclaimer, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { InstrumentListResponseSchema } from "@/server/market/schemas";
import { listPublicInstruments } from "@/server/market/service";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/trade/instruments",
  summary: "List tradeable instruments with live quotes (Explore mode, TR-02/08)",
  description:
    "Every active instrument with its live quote merged in. Visible regardless of the " +
    "learner's trading-unlock progress (explore mode, PRODUCT_SPEC.md §4) - only placing " +
    "an order is gated. `quote` is null when the market-data vendor has no data for a symbol " +
    "right now; the app should show the instrument's own last-known display fields, never a " +
    "synthetic price (no volatility control, ever).",
  tags: ["Trade"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Active instruments with live quotes",
      content: { "application/json": { schema: InstrumentListResponseSchema } },
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
  const result = await listPublicInstruments();
  return okWithDisclaimer(result.data, result.disclaimer);
});
