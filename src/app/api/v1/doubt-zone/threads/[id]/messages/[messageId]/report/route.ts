import { requireUser } from "@/lib/auth";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { ReportMessageParamsSchema, ReportMessageResponseSchema } from "@/server/doubt-zone/schemas";
import { reportMessage } from "@/server/doubt-zone/service";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "post",
  path: "/api/v1/doubt-zone/threads/{id}/messages/{messageId}/report",
  summary: "Report a Doubt Zone AI reply",
  description:
    "Flags an assistant message for staff review (doubt_zone.moderate) - same flagged-only " +
    "visibility as a safety-classifier flag (docs/ARCHITECTURE.md's Phase 7 kickoff decisions). " +
    "Idempotent: reporting an already-flagged message logs the report again but doesn't change " +
    "anything else. Only the caller's own thread, and only an assistant-role message, can be " +
    "reported.",
  tags: ["Doubt Zone"],
  security: [{ bearerAuth: [] }],
  request: { params: ReportMessageParamsSchema },
  responses: {
    200: {
      description: "Reported",
      content: { "application/json": { schema: ReportMessageResponseSchema } },
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
      description: "No thread/message with this id belonging to the caller",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No message with this id in this thread" } },
        },
      },
    },
    400: {
      description: "The message isn't an assistant reply",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "VALIDATION_FAILED", message: "Only an assistant reply can be reported" } },
        },
      },
    },
  },
});

export const POST = withErrors(
  async (req: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) => {
    const user = await requireUser(req);
    await requireFullAccess(user);
    const { id, messageId } = ReportMessageParamsSchema.parse(await params);
    await reportMessage({ id: user.id }, id, messageId, requestMeta(req.headers));
    return ok({ reported: true as const });
  },
);
