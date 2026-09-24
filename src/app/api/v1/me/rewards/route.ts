import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { RewardListResponseSchema } from "@/server/rewards/schemas";
import { getMyRewards } from "@/server/rewards/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/rewards",
  summary: "List my rewards catalog (PR-21/22/23)",
  description:
    "Every published reward with a fixed, admin-set price and whether the caller has already " +
    "claimed it - a reward can be claimed at most once per learner.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The reward catalog",
      content: { "application/json": { schema: RewardListResponseSchema } },
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
  return ok(await getMyRewards(user.id));
});
