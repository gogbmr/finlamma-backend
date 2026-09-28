import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { checkRateLimit, PULSE_CHECK_STEP_RATE_LIMIT } from "@/lib/redis";
import { requireFullAccess } from "@/server/onboarding/service";
import { PulseCheckAttemptParamsSchema, PulseCheckFinishResponseSchema } from "@/server/pulse-check/schemas";
import { finishAttempt } from "@/server/pulse-check/service";

registry.registerPath({
  method: "post",
  path: "/api/v1/pulse-check/{attemptId}/finish",
  summary: "Finish a Pulse Check attempt and credit V Money (NW-25, NW-26)",
  description:
    "Requires every question to already be answered. Computes the all-correct bonus, applies " +
    "the global vm_issuance_multiplier, then clamps to what's left of today's daily VM cap " +
    "(docs/ARCHITECTURE.md D51 - default 200 VM/day, admin-editable). Idempotent: calling this " +
    "again for an already-finished attempt returns the exact original result, credits nothing " +
    "twice. Crediting itself is keyed on (userId, edition) not (userId, attempt) - so however " +
    "many attempts a learner plays at one edition, at most one nonzero credit is ever issued " +
    "for it, matching this codebase's standard insert-and-onConflictDoNothing idempotency " +
    "pattern (D26). Also records the pulse_check streak scope, unconditionally - a capped or " +
    "even zero-VM attempt still counts as today's activity.",
  tags: ["Pulse Check"],
  security: [{ bearerAuth: [] }],
  request: { params: PulseCheckAttemptParamsSchema },
  responses: {
    200: {
      description: "The finished attempt's payout summary",
      content: { "application/json": { schema: PulseCheckFinishResponseSchema } },
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
      description: "Not every question has been answered yet",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "CONFLICT", message: "Answer every question before finishing" } },
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

export const POST = withErrors(async (req: Request, { params }: { params: Promise<{ attemptId: string }> }) => {
  const user = await requireUser(req);
  await requireFullAccess(user);
  const { allowed } = await checkRateLimit(user.id, PULSE_CHECK_STEP_RATE_LIMIT, true);
  if (!allowed) {
    throw new AppError("RATE_LIMITED", "Too many requests - slow down and try again shortly");
  }
  const parsed = PulseCheckAttemptParamsSchema.safeParse(await params);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", "Invalid attempt id");
  return ok(await finishAttempt(user, parsed.data.attemptId, requestMeta(req.headers)));
});
