import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { VmoneyStatsResponseSchema } from "@/server/economy/schemas";
import { getVmoneyStats } from "@/server/economy/service";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/stats/vmoney",
  summary: "Get my V Money stats (World Home header V MONEY tile, WH-03)",
  description:
    "Balance and V Money earned/spent in the trailing 7 days. Balance is always summed live " +
    "from vmoney_ledger (CLAUDE.md rule 2) - it is never a stored column. There is no spend " +
    "path yet in this phase (trading is Phase 4+), so weeklySpent is currently always 0 - it " +
    "starts reflecting real spends automatically once one exists, no API change needed. " +
    "\"Earned from trade\" (also part of WH-03) is omitted entirely until trading exists.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The caller's V Money stats",
      content: { "application/json": { schema: VmoneyStatsResponseSchema } },
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
  return ok(await getVmoneyStats(user.id));
});
