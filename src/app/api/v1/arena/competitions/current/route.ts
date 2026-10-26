import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { getCurrentCompetitionView } from "@/server/competitions/service";
import { CurrentCompetitionResponseSchema } from "@/server/competitions/schemas";

registry.registerPath({
  method: "get",
  path: "/api/v1/arena/competitions/current",
  summary: "Get the current Monthly Competition (AR-14)",
  description:
    "The competition hero card: name, instrument (symbol/exchange/display name - pass `symbol` " +
    "to GET /trade/instruments/{symbol} for a live quote), virtual capital (a non-convertible " +
    "sandbox balance - docs/ARCHITECTURE.md D57, never V Money), window, days left, prize bands, " +
    "rules text, and the enforced limits (`maxTrades`, `minQualifyingTrades`, `entryClosesAt`) - " +
    "the same settings_kv values trade placement, settlement and the entry-window check actually " +
    "use, not a second hardcoded copy. Null when no competition is currently published and " +
    "within its window - the app should show an empty state, not an error. Live LTP/% change " +
    "isn't included here - use GET /trade/instruments/{symbol} for that.",
  tags: ["Arena"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The current competition, or null",
      content: { "application/json": { schema: CurrentCompetitionResponseSchema } },
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
  return ok(await getCurrentCompetitionView());
});
