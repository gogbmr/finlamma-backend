import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { getActivityFeed } from "@/server/arena/service";
import { ArenaActivityResponseSchema } from "@/server/arena/schemas";

registry.registerPath({
  method: "get",
  path: "/api/v1/arena/activity",
  summary: "Get the recent-activity ticker (AR-03)",
  description: "The most recent real XP credits app-wide, newest first, kid-safe display name only.",
  tags: ["Arena"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Recent activity",
      content: { "application/json": { schema: ArenaActivityResponseSchema } },
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
  return ok(await getActivityFeed());
});
