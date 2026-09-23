import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { checkRateLimit, LESSON_STEP_RATE_LIMIT } from "@/lib/redis";
import { requireFullAccess } from "@/server/onboarding/service";
import { CompleteUngradedLessonResponseSchema, LessonIdParamSchema } from "@/server/lesson-progress/schemas";
import { completeUngradedLesson } from "@/server/lesson-progress/service";

registry.registerPath({
  method: "post",
  path: "/api/v1/lessons/{id}/complete",
  summary: "Complete a Story or Doubt Zone lesson (credits XP/V Money)",
  description:
    "For Story and Doubt Zone lessons only (see POST .../serve). Requires the lesson to have " +
    "been served first, and at least the kind's own admin-editable minimum time " +
    "(settings_kv.lesson_flow_scoring.storyMinCompletionSeconds / doubtZoneMinCompletionSeconds) " +
    "to have elapsed since that server-stamped serve time - never a client-reported duration " +
    "(docs/ARCHITECTURE.md D21's server-timed reasoning applies here too). Credits at most once " +
    "per user per lesson (docs/ECONOMY.md decision 4, D26): completing an already-completed " +
    "lesson is an idempotent no-op, `credited: false`, never a second credit.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  request: { params: LessonIdParamSchema },
  responses: {
    200: {
      description: "The lesson is now completed",
      content: { "application/json": { schema: CompleteUngradedLessonResponseSchema } },
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
    409: {
      description: "Not served yet - call POST /lessons/{id}/serve first",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: { code: "CONFLICT", message: "Not served yet - call POST /lessons/{id}/serve first" },
          },
        },
      },
    },
    429: {
      description:
        "Either too many requests, or not enough time has elapsed since serve yet (LESSON_TOO_SOON) - " +
        "both mean: wait, then retry the exact same request",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: {
              code: "LESSON_TOO_SOON",
              message: "Spend a bit more time here before completing (150s minimum, 40s so far)",
              details: { minSeconds: 150, secondsElapsed: 40 },
            },
          },
        },
      },
    },
  },
});

export const POST = withErrors(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser(req);
    await requireFullAccess(user);
    // Fails OPEN (docs/ROADMAP.md Phase 3 checkpoint 1) - see serve/route.ts.
    const { allowed } = await checkRateLimit(user.id, LESSON_STEP_RATE_LIMIT, true);
    if (!allowed) {
      throw new AppError("RATE_LIMITED", "Too many requests - slow down and try again shortly");
    }
    const { id } = LessonIdParamSchema.parse(await params);
    return ok(await completeUngradedLesson(user, id, requestMeta(req.headers)));
  },
);
