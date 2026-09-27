import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { SipPlanActionSchema, SipPlanResponseSchema } from "@/server/fund-orders/sip-schemas";
import { updateSipPlanStatus } from "@/server/fund-orders/sip-service";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "patch",
  path: "/api/v1/trade/funds/sip/{id}",
  summary: "Pause, resume or cancel a SIP plan",
  description:
    "Pause is reversible (a paused month is silently skipped, not recorded as a failure - the " +
    "learner chose it). Cancel is terminal - a cancelled plan can never be resumed, only " +
    "replaced with a new one.",
  tags: ["Trade"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.uuid() }),
    body: {
      content: { "application/json": { schema: SipPlanActionSchema, example: { action: "pause" } } },
    },
  },
  responses: {
    200: {
      description: "The updated SIP plan",
      content: { "application/json": { schema: SipPlanResponseSchema } },
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
    404: {
      description: "No SIP plan with this id owned by the caller",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No SIP plan with this id" } },
        },
      },
    },
    409: {
      description: "The requested action doesn't apply to the plan's current status (e.g. pausing an already-cancelled plan)",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "CONFLICT", message: "Cannot pause a SIP plan that is currently \"cancelled\"" } },
        },
      },
    },
  },
});

export const PATCH = withErrors(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser(req);
    await requireFullAccess(user);
    const { id } = await params;
    const body = await req.json();
    const { action } = SipPlanActionSchema.parse(body);
    return ok(await updateSipPlanStatus(user, id, action, requestMeta(req.headers)));
  },
);
