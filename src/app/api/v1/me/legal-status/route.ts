import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { LegalStatusResponseSchema } from "@/server/legal/schemas";
import { getLegalStatus } from "@/server/legal/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/legal-status",
  summary: "Get my legal-document acceptance status",
  description:
    "Whether the signed-in user has accepted the currently published Terms/Privacy/" +
    "Risk-disclosure themselves. For a minor, full access also requires the parent's own " +
    "consent (see the parent-consent endpoints), not just this - this endpoint only covers " +
    "legal-document acceptance.",
  tags: ["Legal"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Acceptance status per currently published document",
      content: { "application/json": { schema: LegalStatusResponseSchema } },
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

export const GET = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  return ok(await getLegalStatus(user));
});
