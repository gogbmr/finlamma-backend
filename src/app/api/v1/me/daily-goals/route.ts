import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { DailyGoalsResponseSchema } from "@/server/daily-goals/schemas";
import { getMyDailyGoals } from "@/server/daily-goals/service";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/daily-goals",
  summary: "Get today's daily goal progress (PR-09)",
  description:
    "Today's (IST) progress on every currently-active daily goal, admin-configured via " +
    "settings_kv (target and on/off per type - see docs/PRODUCT_SPEC.md §2). Never awards XP " +
    "or V Money - a pure progress display over rewards the underlying activity already paid.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Today's active goals with progress",
      content: { "application/json": { schema: DailyGoalsResponseSchema } },
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
  return ok(await getMyDailyGoals(user.id));
});
