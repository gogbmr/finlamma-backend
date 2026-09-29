import { requireUser } from "@/lib/auth";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { sendCheer } from "@/server/arena/service";
import { SendCheerRequestSchema, SendCheerResponseSchema } from "@/server/arena/schemas";

registry.registerPath({
  method: "post",
  path: "/api/v1/arena/cheers",
  summary: "Cheer another learner (AR-12)",
  description:
    "Sends a cheer, worth a fixed amount of XP (settings_kv, default 5) to the receiver. One " +
    "cheer per sender-receiver pair per IST day - repeating the same day is a successful no-op, " +
    "never a second credit. A daily total cap on how much XP a receiver can bank from cheers " +
    "(settings_kv) may reduce or zero xpAwarded even on a fresh cheer. Fails if the receiver has " +
    "turned off cheersEnabled (PATCH /me's preferences) - never shows another learner's identity, " +
    "only whether the cheer itself succeeded.",
  tags: ["Arena"],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { "application/json": { schema: SendCheerRequestSchema } } } },
  responses: {
    200: {
      description: "The cheer was processed (possibly a no-op replay, possibly capped)",
      content: { "application/json": { schema: SendCheerResponseSchema } },
    },
    400: {
      description: "Invalid request, or cheering yourself",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "VALIDATION_FAILED", message: "You can't cheer yourself" } },
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
      description: "Receiver not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "Learner not found" } },
        },
      },
    },
    409: {
      description: "The receiver has turned off cheersEnabled",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: { code: "CHEER_RECEIVER_OPTED_OUT", message: "This learner isn't receiving cheers right now" },
          },
        },
      },
    },
  },
});

export const POST = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await requireFullAccess(user);
  const { receiverId } = SendCheerRequestSchema.parse(await req.json());
  return ok(await sendCheer(user, receiverId, requestMeta(req.headers)));
});
