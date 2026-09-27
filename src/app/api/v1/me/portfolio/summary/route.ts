import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { PortfolioSummaryResponseSchema } from "@/server/portfolio/schemas";
import { getPortfolioSummary } from "@/server/portfolio/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/portfolio/summary",
  summary: "Get my portfolio hero + equity sparkline (Profile Trades tab, PR-25)",
  description:
    "Cash balance, current holdings market value, all-time trading P&L (realized + unrealized, " +
    "never compared against a fixed starting deposit - V Money is earned from many non-trading " +
    "sources) and up to 12 equity-curve points built by replaying every fill chronologically.",
  tags: ["Trade"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The caller's portfolio summary",
      content: { "application/json": { schema: PortfolioSummaryResponseSchema } },
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
  return ok(await getPortfolioSummary(user.id));
});
