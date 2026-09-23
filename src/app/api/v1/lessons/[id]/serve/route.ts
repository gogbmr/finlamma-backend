import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { checkRateLimit, LESSON_STEP_RATE_LIMIT } from "@/lib/redis";
import { requireFullAccess } from "@/server/onboarding/service";
import { LessonIdParamSchema, ServeUngradedLessonResponseSchema } from "@/server/lesson-progress/schemas";
import { serveUngradedLesson } from "@/server/lesson-progress/service";

registry.registerPath({
  method: "post",
  path: "/api/v1/lessons/{id}/serve",
  summary: "Serve a Story or Doubt Zone lesson (starts its completion timer)",
  description:
    "For Story and Doubt Zone lessons only - these have no graded questions (docs/ARCHITECTURE.md " +
    "D23), so unlike a Video/Quiz/Role Play/Boss Quiz lesson there is no POST .../steps/{n}/serve " +
    "to call instead. The returned `startedAt` is server-stamped and never trusted from the " +
    "client - POST /lessons/{id}/complete measures elapsed time from it, not from anything the " +
    "app reports. Idempotent: re-serving an already-served (or already-completed) lesson returns " +
    "the exact original startedAt, never a new one.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  request: { params: LessonIdParamSchema },
  responses: {
    200: {
      description: "The lesson's current progress, with its server-stamped startedAt",
      content: { "application/json": { schema: ServeUngradedLessonResponseSchema } },
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
      description: "No published lesson with this id",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No published lesson with this id" } },
        },
      },
    },
    400: {
      description: "This lesson isn't a Story or Doubt Zone kind - use the graded-step endpoints instead",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: {
              code: "VALIDATION_FAILED",
              message: '"quiz" lessons use POST /lessons/{id}/steps/{n}/serve, not this endpoint',
            },
          },
        },
      },
    },
    429: {
      description: "Too many requests - slow down and try again shortly",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "RATE_LIMITED", message: "Too many requests - slow down and try again shortly" } },
        },
      },
    },
  },
});

export const POST = withErrors(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser(req);
    await requireFullAccess(user);
    // Fails OPEN (docs/ROADMAP.md Phase 3 checkpoint 1): if Redis is
    // unreachable, this learning endpoint stays usable rather than blocking
    // every learner over an ops config gap - see src/lib/redis.ts. Shares
    // the same limiter as the graded-step serve/answer endpoints - same
    // abuse class (a learning endpoint interaction), no reason for a
    // separate bucket.
    const { allowed } = await checkRateLimit(user.id, LESSON_STEP_RATE_LIMIT, true);
    if (!allowed) {
      throw new AppError("RATE_LIMITED", "Too many requests - slow down and try again shortly");
    }
    const { id } = LessonIdParamSchema.parse(await params);
    return ok(await serveUngradedLesson(user, id, requestMeta(req.headers)));
  },
);
