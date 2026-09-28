import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { PulseCheckAttemptParamsSchema, PulseCheckResultResponseSchema } from "@/server/pulse-check/schemas";
import { getResult } from "@/server/pulse-check/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/pulse-check/{attemptId}/result",
  summary: "Get a finished Pulse Check attempt's result (NW-27..31)",
  description:
    "Self-contained - never depends on the source stories still being published " +
    "(docs/ARCHITECTURE.md D51): every field comes from pulse_check_attempts/pulse_check_answers, " +
    "which are snapshotted at answer time, not a live join. dailyCapReached (from D51's daily VM " +
    "cap) is surfaced explicitly so a smaller-than-expected payout is never shown as a silent, " +
    "unexplained number.",
  tags: ["Pulse Check"],
  security: [{ bearerAuth: [] }],
  request: { params: PulseCheckAttemptParamsSchema },
  responses: {
    200: {
      description: "The attempt's result",
      content: { "application/json": { schema: PulseCheckResultResponseSchema } },
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
      description: "This attempt isn't finished yet",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "CONFLICT", message: "This attempt isn't finished yet" } },
        },
      },
    },
  },
});

export const GET = withErrors(async (req: Request, { params }: { params: Promise<{ attemptId: string }> }) => {
  const user = await requireUser(req);
  await requireFullAccess(user);
  const parsed = PulseCheckAttemptParamsSchema.safeParse(await params);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", "Invalid attempt id");
  return ok(await getResult(user, parsed.data.attemptId));
});
