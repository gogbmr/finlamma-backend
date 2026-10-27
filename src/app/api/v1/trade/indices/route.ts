import { requireUser } from "@/lib/auth";
import { okWithDisclaimer, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { IndexQuotesResponseSchema } from "@/server/market/schemas";
import { getIndexQuotes } from "@/server/market/service";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/trade/indices",
  summary: "List the NIFTY 50 / BANK NIFTY / SENSEX index strip (TR-04)",
  description:
    "Index-level value + change for a fixed set of indices - not tradeable instruments, so " +
    "there's no DB row per index (docs/DATA_MODEL.md); values come from the same market-data " +
    "provider and cache path as every other quote in this API. An index the vendor has no data " +
    "for right now is simply omitted from the list, never returned with a synthetic value.",
  tags: ["Trade"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Current index strip",
      content: { "application/json": { schema: IndexQuotesResponseSchema } },
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
  const result = await getIndexQuotes();
  return okWithDisclaimer(result.data, result.disclaimer, result.disclaimerLocalized);
});
