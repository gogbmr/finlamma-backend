import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { BadgeListResponseSchema } from "@/server/badges/schemas";
import { getMyBadges } from "@/server/badges/service";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/badges",
  summary: "List my badges, unlocked and locked (PR-16/17/18/19/20)",
  description:
    "Every published badge with the caller's own progress and unlock state. A locked badge " +
    "shows real progress toward its threshold (e.g. \"7/10\"), not just 0, so the app can " +
    "render progress rings for badges not yet earned.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The caller's badges",
      content: { "application/json": { schema: BadgeListResponseSchema } },
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
  return ok(await getMyBadges(user.id));
});
