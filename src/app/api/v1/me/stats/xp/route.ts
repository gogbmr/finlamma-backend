import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { getXpStats } from "@/server/leveling/service";
import { XpStatsResponseSchema } from "@/server/leveling/schemas";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/stats/xp",
  summary: "Get my XP stats (World Home header XP tile, WH-04)",
  description:
    "Total XP, current level and XP progress to the next level, plus XP earned in the " +
    "trailing 7 days. Level is always derived from total XP using the admin-editable level " +
    "curve (settings_kv) - it is never stored. Percentile rank is omitted until Phase 6 ships " +
    "Arena's weekly leaderboard snapshot to read it from (docs/FEATURE_MAP.md PR-03).",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The caller's XP stats",
      content: { "application/json": { schema: XpStatsResponseSchema } },
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
  return ok(await getXpStats(user.id));
});
