import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { LessonStepParamsSchema, ServeStepResponseSchema } from "@/server/quiz-attempts/schemas";
import { serveStep } from "@/server/quiz-attempts/service";

registry.registerPath({
  method: "post",
  path: "/api/v1/lessons/{id}/steps/{n}/serve",
  summary: "Serve the next graded step of a lesson (starts or resumes an attempt)",
  description:
    "Server-timed (docs/ARCHITECTURE.md D21): the returned `servedAt` is what this step's " +
    "timer runs from, and is never trusted from the client on submit. Only the current, " +
    "next-in-sequence step can be served - no skipping ahead. Starts a new attempt on step 1 " +
    "if none is in progress, or resumes an already-served-but-unanswered step idempotently. " +
    "Never includes this question's correct answer or explanation - see POST .../answer.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  request: { params: LessonStepParamsSchema },
  responses: {
    200: {
      description: "The step to render",
      content: { "application/json": { schema: ServeStepResponseSchema } },
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
      description: "No published lesson with this id, or its question is no longer available",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No published lesson with this id" } },
        },
      },
    },
    409: {
      description: "Not the current step (no skip-ahead), or the step is already answered",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: { code: "CONFLICT", message: "Not the current step - answer earlier steps first" },
          },
        },
      },
    },
  },
});

export const POST = withErrors(
  async (req: Request, { params }: { params: Promise<{ id: string; n: string }> }) => {
    const user = await requireUser(req);
    await requireFullAccess(user);
    const raw = await params;
    const parsed = LessonStepParamsSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", "Invalid lesson id or step number");
    }
    const { id, n } = parsed.data;
    return ok(await serveStep(user, id, n, requestMeta(req.headers)));
  },
);
