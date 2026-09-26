import { requireUser } from "@/lib/auth";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { CreateSipPlanSchema, SipPlanListResponseSchema, SipPlanResponseSchema } from "@/server/fund-orders/sip-schemas";
import { createSip, listMySips } from "@/server/fund-orders/sip-service";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/trade/funds/sip",
  summary: "List my SIP plans, including recent execution history (TR-37)",
  description:
    "Every plan's next due date, status, and its most recent executions - a failed execution " +
    "(e.g. insufficient balance on the due date) is always visible here, never silently " +
    "skipped (docs/ARCHITECTURE.md D46).",
  tags: ["Trade"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The caller's SIP plans",
      content: { "application/json": { schema: SipPlanListResponseSchema } },
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

registry.registerPath({
  method: "post",
  path: "/api/v1/trade/funds/sip",
  summary: "Create a new SIP plan",
  description:
    "amountPaise must meet the fund's tiered minimum (₹100 for index funds, ₹500 for others, " +
    "admin-editable per fund). dayOfMonth is restricted to 1-28 so every SIP has a real due " +
    "date every calendar month.",
  tags: ["Trade"],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateSipPlanSchema,
          example: { fundId: "00000000-0000-0000-0000-000000000000", amountPaise: 10000, dayOfMonth: 5 },
        },
      },
    },
  },
  responses: {
    200: {
      description: "The newly created SIP plan",
      content: { "application/json": { schema: SipPlanResponseSchema } },
    },
    400: {
      description: "Invalid input, or below the fund's minimum SIP amount",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "VALIDATION_FAILED", message: "Minimum SIP amount for this fund is 10000 paise" } },
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
      description: "Onboarding incomplete, or trading isn't unlocked yet for this learner",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "FORBIDDEN", message: "Trading is locked until you clear more worlds" } },
        },
      },
    },
    404: {
      description: "No active fund with this id",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No fund with this id" } },
        },
      },
    },
  },
});

export const GET = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await requireFullAccess(user);
  return ok(await listMySips(user.id));
});

export const POST = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await requireFullAccess(user);
  const body = await req.json();
  const input = CreateSipPlanSchema.parse(body);
  return ok(await createSip(user, input, requestMeta(req.headers)));
});
