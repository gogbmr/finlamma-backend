import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { ClaimRewardResponseSchema } from "@/server/rewards/schemas";
import { claimReward } from "@/server/rewards/service";

const RewardIdParamSchema = z.object({ id: z.string().uuid() });

registry.registerPath({
  method: "post",
  path: "/api/v1/me/rewards/{id}/claim",
  summary: "Claim a reward (PR-22)",
  description:
    "Debits the reward's price_vm from the caller's balance and records the claim. A reward can " +
    "be claimed at most once per learner - calling this again on an already-claimed reward is an " +
    "idempotent replay (alreadyClaimed: true, no second debit), never a second charge. Balance " +
    "can never go negative: the debit runs inside a locked transaction, so two concurrent claims " +
    "for the same learner can never both succeed if only one can be afforded.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  request: { params: RewardIdParamSchema },
  responses: {
    200: {
      description: "Claimed (or already claimed)",
      content: { "application/json": { schema: ClaimRewardResponseSchema } },
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
      description: "No published reward with this id",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No published reward with this id" } },
        },
      },
    },
    409: {
      description: "Insufficient V Money balance",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: {
              code: "INSUFFICIENT_VMONEY",
              message: "Not enough V Money - this costs 500, you have 200",
            },
          },
        },
      },
    },
    429: {
      description: "Too many claim attempts, or the rate limiter couldn't be reached (fails closed)",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: { code: "RATE_LIMITED", message: "Too many claim attempts - slow down and try again shortly" },
          },
        },
      },
    },
  },
});

export const POST = withErrors(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser(req);
    await requireFullAccess(user);
    const { id } = RewardIdParamSchema.parse(await params);
    return ok(await claimReward(user, id, requestMeta(req.headers)));
  },
);
