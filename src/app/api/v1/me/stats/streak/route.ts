import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { StreakStatsResponseSchema } from "@/server/streaks/schemas";
import { getStreakStats } from "@/server/streaks/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/stats/streak",
  summary: "Get my streak stats (World Home header STREAK tile, WH-02)",
  description:
    "Current/longest streak and freezes left, for both independent habit loops - `learning` " +
    "(lesson completions, docs/ECONOMY.md decision 5) and `pulseCheck` (News' Pulse Check, " +
    "Phase 5 - always 0/0/full freezes until that phase ships the events that trigger it). " +
    "Day boundaries are computed server-side in IST (Asia/Kolkata) from the server's own clock - " +
    "never a client-reported date or timezone.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The caller's streak stats",
      content: { "application/json": { schema: StreakStatsResponseSchema } },
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
  return ok(await getStreakStats(user.id));
});
