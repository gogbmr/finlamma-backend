import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { checkRateLimit, PULSE_CHECK_STEP_RATE_LIMIT } from "@/lib/redis";
import { requireFullAccess } from "@/server/onboarding/service";
import { PulseCheckServeResponseSchema, PulseCheckStepParamsSchema } from "@/server/pulse-check/schemas";
import { serveStep } from "@/server/pulse-check/service";

registry.registerPath({
  method: "post",
  path: "/api/v1/pulse-check/{attemptId}/steps/{n}/serve",
  summary: "Serve the next question in a Pulse Check attempt",
  description:
    "Server-timed, same design as lesson-flow's steps/{n}/serve (docs/ARCHITECTURE.md D21): " +
    "the returned timer starts from this call, never trusted from the client on submit. Only " +
    "the current, next-in-sequence step can be served - no skipping ahead. Idempotent re-serve " +
    "of an unanswered step returns the original servedAt. Includes the question's source " +
    "headline (NW-13) - never its correct answer or explanation.",
  tags: ["Pulse Check"],
  security: [{ bearerAuth: [] }],
  request: { params: PulseCheckStepParamsSchema },
  responses: {
    200: {
      description: "The question to render",
      content: { "application/json": { schema: PulseCheckServeResponseSchema } },
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
      description: "No attempt with this id",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No Pulse Check attempt with this id" } },
        },
      },
    },
    409: {
      description: "Not the current step, or the attempt is already finished",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "CONFLICT", message: "Answer the previous question first" } },
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
    return ok(await serveStep(user, parsed.data.attemptId, parsed.data.n));
  },
);
