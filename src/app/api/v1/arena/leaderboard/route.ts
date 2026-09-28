import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { getLeaderboard } from "@/server/arena/service";
import { ArenaLeaderboardResponseSchema, ArenaScopeKindSchema } from "@/server/arena/schemas";

registry.registerPath({
  method: "get",
  path: "/api/v1/arena/leaderboard",
  summary: "Get the weekly Arena leaderboard for a scope (AR-05/06/07/09/10)",
  description:
    "Ranks every learner by XP earned since Monday IST, for the requested scope. 'state' and " +
    "'world' are resolved from the caller's own profile (users.state / their current world) - " +
    "there is no way to view another scope's raw pool directly. A thin scope (below " +
    "settings_kv's arena_min_leaderboard_pool_size, default 20) either falls back to a broader " +
    "scope (state -> india) or is returned with notEnoughPlayers: true (world/india/global, " +
    "which have no broader fallback) - see docs/ARCHITECTURE.md's Phase 6 kickoff decision. " +
    "Every XP credit behind this ranking is idempotent per (user, source) at the ledger level " +
    "(D26), so replaying a lesson or quiz can never inflate a learner's weekly total.",
  tags: ["Arena"],
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      scope: ArenaScopeKindSchema,
    }),
  },
  responses: {
    200: {
      description: "The requested (or fallback) scope's weekly leaderboard",
      content: { "application/json": { schema: ArenaLeaderboardResponseSchema } },
    },
    400: {
      description: "Invalid or missing scope query parameter",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: {
              code: "VALIDATION_FAILED",
              message: "scope must be one of world, state, india, global",
            },
          },
        },
      },
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

  const scopeParam = new URL(req.url).searchParams.get("scope");
  const parsed = ArenaScopeKindSchema.safeParse(scopeParam);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", "scope must be one of world, state, india, global");
  }

  return ok(await getLeaderboard(user, parsed.data));
});
