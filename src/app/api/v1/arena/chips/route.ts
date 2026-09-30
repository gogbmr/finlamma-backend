import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { listActiveChipsForLearner } from "@/server/arena/service";
import { AboutMeChipListResponseSchema } from "@/server/arena/schemas";

registry.registerPath({
  method: "get",
  path: "/api/v1/arena/chips",
  summary: "List the active about-me chip catalog (AR-20)",
  description:
    "The admin-managed preset chips a learner can pick for their public profile - never " +
    "free text (docs/ARCHITECTURE.md D36).",
  tags: ["Arena"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Active chips",
      content: { "application/json": { schema: AboutMeChipListResponseSchema } },
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
  return ok(await listActiveChipsForLearner());
});
