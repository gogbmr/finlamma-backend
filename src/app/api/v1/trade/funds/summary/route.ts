import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { FundFolioSummaryResponseSchema } from "@/server/funds/schemas";
import { getFundFolioSummary } from "@/server/funds/service";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/trade/funds/summary",
  summary: "My fund-portfolio folio summary (app ask A2)",
  description:
    "Aggregated across every fund this learner currently holds: total invested (cost basis), " +
    "total current value at the latest ingested NAV, and overall returns. A held fund that's " +
    "never been ingested a NAV yet contributes its cost basis to the current-value total " +
    "(zero gain/loss for that one holding) rather than being dropped or guessed at. Zero values " +
    "when the learner holds no funds.",
  tags: ["Trade"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The caller's fund folio summary",
      content: { "application/json": { schema: FundFolioSummaryResponseSchema } },
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
  return ok((await getFundFolioSummary(user.id)).data);
});
