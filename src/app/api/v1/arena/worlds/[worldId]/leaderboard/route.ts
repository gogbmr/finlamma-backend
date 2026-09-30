import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { getWorldLeaderboard } from "@/server/arena/service";
import { ArenaLeaderboardResponseSchema } from "@/server/arena/schemas";

registry.registerPath({
  method: "get",
  path: "/api/v1/arena/worlds/{worldId}/leaderboard",
  summary: "Get one world's own weekly leaderboard (AR-06)",
  description:
    "Drilling into a specific world tapped from GET /arena/worlds - not necessarily the caller's " +
    "own current world. Same shape, privacy floor and self-row handling as GET /arena/leaderboard " +
    "(a thin world has no broader scope to fall back to, so it reports notEnoughPlayers instead).",
  tags: ["Arena"],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ worldId: z.string().uuid() }) },
  responses: {
    200: {
      description: "That world's weekly leaderboard",
      content: { "application/json": { schema: ArenaLeaderboardResponseSchema } },
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

export const GET = withErrors(
  async (req: Request, { params }: { params: Promise<{ worldId: string }> }) => {
    const user = await requireUser(req);
    await requireFullAccess(user);
    const { worldId } = await params;
    return ok(await getWorldLeaderboard(user, worldId));
  },
);
