import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { getCompetitionLeaderboard } from "@/server/competitions/service";
import { CompetitionLeaderboardResponseSchema } from "@/server/competitions/schemas";

registry.registerPath({
  method: "get",
  path: "/api/v1/arena/competitions/current/leaderboard",
  summary: "Get the current Monthly Competition's ranked board (AR-16)",
  description:
    "Every entrant ranked live by ROI% (top 50, plus the caller's own row if they'd otherwise " +
    "fall outside that window - same shape as GET /arena/leaderboard). Kid-safe display name " +
    "only. Row expansion (best trade, win rate, avg hold time) isn't built yet - a fast-follow, " +
    "same as the Worlds/Players ladders' own AR-10 row expansion. Null when there's no active " +
    "competition right now.",
  tags: ["Arena"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The current competition's leaderboard, or null",
      content: { "application/json": { schema: CompetitionLeaderboardResponseSchema } },
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
  return ok(await getCompetitionLeaderboard(user));
});
