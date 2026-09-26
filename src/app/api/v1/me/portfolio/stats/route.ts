import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { PortfolioStatsResponseSchema } from "@/server/portfolio/schemas";
import { getPortfolioStats } from "@/server/portfolio/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/portfolio/stats",
  summary: "Get my trading stats grid + win/loss split (Profile Trades tab, PR-26/PR-27)",
  description:
    "Realized P&L, win rate, average hold time and best/worst trade, all derived from closed " +
    "(SELL) fills. Does not include a \"coins earned from trading\" figure - placing a trade " +
    "never pays XP/V Money in this app's economy, only lessons/badges/streaks/rewards do.",
  tags: ["Trade"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The caller's trading stats",
      content: { "application/json": { schema: PortfolioStatsResponseSchema } },
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
  return ok(await getPortfolioStats(user.id));
});
