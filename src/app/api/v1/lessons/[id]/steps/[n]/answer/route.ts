import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import {
  LessonStepParamsSchema,
  SubmitAnswerRequestSchema,
  SubmitAnswerResponseSchema,
} from "@/server/quiz-attempts/schemas";
import { submitAnswer } from "@/server/quiz-attempts/service";

registry.registerPath({
  method: "post",
  path: "/api/v1/lessons/{id}/steps/{n}/answer",
  summary: "Submit an answer for the current step and grade it",
  description:
    "Server-graded and server-timed - the submitted answer is checked against the question's " +
    "real answer server-side, and the elapsed time used for the speed bonus/timeout is measured " +
    "from this step's serve time, never a client-reported value (docs/ARCHITECTURE.md D21). " +
    "Idempotent: submitting again for an already-answered step returns the exact original " +
    "graded result unchanged, no re-scoring. This is the ONLY response that reveals this " +
    "question's correct answer and explanation - never for any other step. No " +
    "`Idempotency-Key` header is needed (unlike trading orders): the (attempt, step) pair " +
    "already is the natural idempotency key, since only one attempt is ever in progress per " +
    "(user, lesson) and only one unanswered row can exist per step.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  request: {
    params: LessonStepParamsSchema,
    body: { content: { "application/json": { schema: SubmitAnswerRequestSchema } } },
  },
  responses: {
    200: {
      description: "The graded result for this step",
      content: { "application/json": { schema: SubmitAnswerResponseSchema } },
    },
    400: {
      description: "The submitted answer doesn't match this question's format shape",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: {
              code: "VALIDATION_FAILED",
              message: 'Invalid answer for a "single_select" question: answer.correctIndex: Required',
            },
          },
        },
      },
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
      description: "No published lesson with this id, or the question no longer exists",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No published lesson with this id" } },
        },
      },
    },
    409: {
      description: "No active attempt, or this step hasn't been served yet",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: { code: "CONFLICT", message: "This step hasn't been served yet" },
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
    const rawParams = await params;
    const parsedParams = LessonStepParamsSchema.safeParse(rawParams);
    if (!parsedParams.success) {
      throw new AppError("VALIDATION_FAILED", "Invalid lesson id or step number");
    }
    const { id, n } = parsedParams.data;
    const { answer } = SubmitAnswerRequestSchema.parse(await req.json());
    return ok(await submitAnswer(user, id, n, answer, requestMeta(req.headers)));
  },
);
