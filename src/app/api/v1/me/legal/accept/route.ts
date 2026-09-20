import { requireUser } from "@/lib/auth";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { AcceptLegalResponseSchema } from "@/server/legal/schemas";
import { acceptLegal } from "@/server/legal/service";

registry.registerPath({
  method: "post",
  path: "/api/v1/me/legal/accept",
  summary: "Accept the currently published legal documents",
  description:
    "Records the signed-in user's own acceptance of every currently published Terms/Privacy/" +
    "Risk-disclosure version not already accepted. Used both by an adult accepting for " +
    "themselves and by a minor's own required in-app acceptance, done once after their " +
    "parent has separately consented.",
  tags: ["Legal"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Newly accepted document types (empty if everything was already accepted)",
      content: { "application/json": { schema: AcceptLegalResponseSchema } },
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
  },
});

export const POST = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  return ok(await acceptLegal(user, requestMeta(req.headers)));
});
