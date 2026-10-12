import { requireUser } from "@/lib/auth";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { rerollMyHandle } from "@/server/peer-handles/service";
import { RerollMyHandleResponseSchema } from "@/server/peer-handles/schemas";

registry.registerPath({
  method: "post",
  path: "/api/v1/me/handle/reroll",
  summary: "Reroll my peer-visible handle (D73)",
  description:
    "Randomly assigns a new staff-curated handle, excluding the caller's current one where " +
    "possible. Allowed once every 30 days - a second attempt inside the cooldown is rejected " +
    "with RESEND_TOO_SOON and a retryAfterSeconds/nextRerollAvailableAt in the error details.",
  tags: ["Users"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The caller's new handle and when the next reroll will be available",
      content: { "application/json": { schema: RerollMyHandleResponseSchema } },
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
    429: {
      description: "Still within the 30-day reroll cooldown",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: {
              code: "RESEND_TOO_SOON",
              message: "You can reroll your handle again in a bit",
              details: { retryAfterSeconds: 1209600, nextRerollAvailableAt: "2026-11-11T00:00:00.000Z" },
            },
          },
        },
      },
    },
  },
});

export const POST = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await requireFullAccess(user);
  const result = await rerollMyHandle(user, requestMeta(req.headers));
  return ok(result);
});
