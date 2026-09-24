import { requireUser } from "@/lib/auth";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { RecordSessionTimeRequestSchema, RecordSessionTimeResponseSchema } from "@/server/session-time/schemas";
import { recordSessionTime } from "@/server/session-time/service";

registry.registerPath({
  method: "post",
  path: "/api/v1/me/session-time",
  summary: "Report a finished session's duration (World Home gap #5)",
  description:
    "Sent once when a session (a lesson/screen, not a heartbeat) ends - adds to today's (IST) " +
    "running total, feeding the daily goal meter's study-minutes target and the weekly report " +
    "card's watch-speed sub-metric. Not reward-bearing (no XP/VM derives from this), so this is " +
    "a client-reported, best-effort signal, capped at 1 hour per call.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: RecordSessionTimeRequestSchema } } },
  },
  responses: {
    200: {
      description: "Updated running total for today",
      content: { "application/json": { schema: RecordSessionTimeResponseSchema } },
    },
    400: {
      description: "seconds out of range",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: { code: "VALIDATION_FAILED", message: "seconds must be between 1 and 3600" },
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
  },
});

export const POST = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await requireFullAccess(user);
  const { seconds } = RecordSessionTimeRequestSchema.parse(await req.json());
  return ok(await recordSessionTime(user, seconds, requestMeta(req.headers)));
});
