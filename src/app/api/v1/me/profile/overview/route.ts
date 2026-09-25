import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { ProfileOverviewResponseSchema } from "@/server/leveling/schemas";
import { requireFullAccess } from "@/server/onboarding/service";
import { getProfileOverview } from "@/server/profile/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/profile/overview",
  summary:
    "Get my profile overview (Profile screen ID card + quick stats, PR-01/02/05/06/07/08)",
  description:
    "Kid-safe identity (first name + last initial only - never a full name or photo, " +
    "CLAUDE.md rule 10), joined date, level, XP progress to the next level, the rank title " +
    "the caller's current level currently qualifies for (admin-editable rank_titles table, or " +
    "null if none applies yet), the learning streak, lesson-completion progress, quiz " +
    "accuracy and a 7-day activity dot calendar. Percentile rank is omitted until Phase 6 " +
    "ships Arena's weekly leaderboard snapshot (docs/FEATURE_MAP.md PR-03) - before that, " +
    "only self-progress is shown.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The caller's profile overview",
      content: { "application/json": { schema: ProfileOverviewResponseSchema } },
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
  return ok(await getProfileOverview(user));
});
