import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { getWorldsLeaderboard } from "@/server/arena/service";
import { ArenaWorldsResponseSchema } from "@/server/arena/schemas";

registry.registerPath({
  method: "get",
  path: "/api/v1/arena/worlds",
  summary: "Get the Worlds leaderboard (AR-04/05)",
  description:
    "Every currently-populated world, ranked by total weekly XP earned by learners currently " +
    "attributed to it (their furthest world with a completed lesson) - includes xpPerMember so " +
    "a small world can compete on average, week-over-week deltaPct, and a 7-day daily sparkline.",
  tags: ["Arena"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The current Worlds leaderboard",
      content: { "application/json": { schema: ArenaWorldsResponseSchema } },
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
  return ok(await getWorldsLeaderboard());
});
