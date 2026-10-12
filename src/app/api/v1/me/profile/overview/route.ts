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
    "The caller's own identity (first name + last initial - never a full name or photo), " +
    "private to them the same way GET /me is (D73, docs/ARCHITECTURE.md - other learners see " +
    "this learner's handle instead, never this), joined date, level, XP progress to the next " +
    "level, the rank title " +
    "the caller's current level currently qualifies for (admin-editable rank_titles table, or " +
    "null if none applies yet), the learning streak, lesson-completion progress, quiz " +
    "accuracy and a 7-day activity dot calendar. `percentile` and `rankDeltaCells` " +
    "(World/State-or-India/Global) read from Arena's last weekly settlement - each is null, " +
    "cleanly, whenever there's nothing to report (no settlement yet, a scope below the " +
    "privacy floor, or no XP that week).",
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
