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
    "Powers World Home's Resume banner (WH-06). Progress-aware: walks published worlds in " +
    "sequential-unlock order and returns the first lesson in the first reachable world that " +
    "isn't yet completed (covers every lesson kind - video/quiz/boss_quiz/role_play via " +
    "quiz_attempts, story/doubt_zone via lesson_progress directly). If a Boss Quiz was attempted " +
    "but failed, this resumes at that same Boss Quiz, since its world never actually unlocked " +
    "the next one. If everything reachable is already completed, resumes at the last lesson of " +
    "the last reachable world. The response shape is identical to GET /api/v1/lessons/{id}.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The caller's current (resume) lesson",
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
  return ok(await getCurrentLesson(user.id));
});
