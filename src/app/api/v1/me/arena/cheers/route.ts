import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { getMyCheersSummary } from "@/server/arena/service";
import { MyCheersSummaryResponseSchema } from "@/server/arena/schemas";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/arena/cheers",
  summary: "Get my cheers-received summary (AR-12)",
  description:
    "An aggregate-only weekly count of cheers received - docs/ARCHITECTURE.md D53: sender " +
    "identity is never shown, in any form, not even a partial breakdown.",
  tags: ["Arena"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The caller's cheers-received summary",
      content: { "application/json": { schema: MyCheersSummaryResponseSchema } },
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

export const GET = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await requireFullAccess(user);
  return ok(await getMyCheersSummary(user));
});
