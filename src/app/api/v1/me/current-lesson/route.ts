import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { LessonDetailResponseSchema } from "@/server/lessons/schemas";
import { getCurrentLesson } from "@/server/lessons/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/current-lesson",
  summary: "Get my current/resume lesson",
  description:
    "Powers World Home's Resume banner (WH-06). **Placeholder until Checkpoint 5's " +
    "lesson_progress table exists**: always returns chapter 1, step 1 of the lowest-order " +
    "published world, regardless of what the caller has actually done - not yet progress-aware. " +
    "The response shape is the real contract (identical to GET /api/v1/lessons/{id}); only the " +
    "selection logic upgrades once real progress tracking ships.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The caller's current lesson (see description for today's placeholder logic)",
      content: { "application/json": { schema: LessonDetailResponseSchema } },
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
    404: {
      description: "No published worlds or lessons yet",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No published worlds yet" } },
        },
      },
    },
  },
});

export const GET = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await requireFullAccess(user);
  return ok(await getCurrentLesson());
});
