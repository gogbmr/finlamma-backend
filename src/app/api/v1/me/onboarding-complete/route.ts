import { requireUser } from "@/lib/auth";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { OnboardingCompleteResponseSchema } from "@/server/onboarding/schemas";
import { completeOnboarding } from "@/server/onboarding/service";

registry.registerPath({
  method: "patch",
  path: "/api/v1/me/onboarding-complete",
  summary: "Mark onboarding's mentor-intro modal as seen",
  description:
    "Idempotent, unlike /me/date-of-birth - a repeat call is a harmless no-op that returns the " +
    "original timestamp. Not a requireFullAccess gate; purely a 'have they seen it' flag for " +
    "World Home's first-open mentor-intro modal (WH-11).",
  tags: ["Onboarding"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Onboarding marked complete (or already was)",
      content: { "application/json": { schema: OnboardingCompleteResponseSchema } },
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
  },
});

export const PATCH = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  return ok(await completeOnboarding(user, requestMeta(req.headers)));
});
