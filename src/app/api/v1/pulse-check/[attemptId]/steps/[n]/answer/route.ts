import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { checkRateLimit, PULSE_CHECK_STEP_RATE_LIMIT } from "@/lib/redis";
import { requireFullAccess } from "@/server/onboarding/service";
import {
  PulseCheckAnswerResponseSchema,
  PulseCheckStepParamsSchema,
  PulseCheckSubmitAnswerRequestSchema,
} from "@/server/pulse-check/schemas";
import { submitAnswer } from "@/server/pulse-check/service";

registry.registerPath({
  method: "post",
  path: "/api/v1/pulse-check/{attemptId}/steps/{n}/answer",
  summary: "Submit an answer for the current Pulse Check question and grade it",
  description:
    "Server-graded and server-timed, same anti-cheat design as lesson-flow's steps/{n}/answer " +
    "(docs/ARCHITECTURE.md D21) - the elapsed time used for the speed bonus/timeout is measured " +
    "from this step's serve time, never a client-reported value. Idempotent: submitting again " +
    "for an already-answered step returns the exact original graded result, no re-scoring. This " +
    "is the only response that reveals this question's correct answer and explanation.",
  tags: ["Pulse Check"],
  security: [{ bearerAuth: [] }],
  request: {
    params: PulseCheckStepParamsSchema,
    body: { content: { "application/json": { schema: PulseCheckSubmitAnswerRequestSchema } } },
  },
  responses: {
    200: {
      description: "The graded result",
      content: { "application/json": { schema: PulseCheckAnswerResponseSchema } },
    },
    400: {
      description: "The submitted answer doesn't match this question's format shape",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "VALIDATION_FAILED", message: 'Invalid answer for a "single_select" question' } },
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
      description: "No attempt or question with this id",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No Pulse Check attempt with this id" } },
        },
      },
    },
    409: {
      description: "This step hasn't been served yet, or the attempt is already finished",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "CONFLICT", message: "This step hasn't been served yet" } },
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
  async (req: Request, { params }: { params: Promise<{ attemptId: string; n: string }> }) => {
    const user = await requireUser(req);
    await requireFullAccess(user);
    const { allowed } = await checkRateLimit(user.id, PULSE_CHECK_STEP_RATE_LIMIT, true);
    if (!allowed) {
      throw new AppError("RATE_LIMITED", "Too many requests - slow down and try again shortly");
    }
    const parsed = PulseCheckStepParamsSchema.safeParse(await params);
    if (!parsed.success) throw new AppError("VALIDATION_FAILED", "Invalid attempt id or step number");
    const { answer } = PulseCheckSubmitAnswerRequestSchema.parse(await req.json());
    return ok(await submitAnswer(user, parsed.data.attemptId, parsed.data.n, answer, requestMeta(req.headers)));
  },
);
