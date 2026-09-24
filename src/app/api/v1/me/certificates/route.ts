import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { CertificateListResponseSchema } from "@/server/certificates/schemas";
import { listMyCertificates } from "@/server/certificates/service";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/certificates",
  summary: "List my certificates (PR-10/PR-36)",
  description:
    "Every world the caller has completed (passed that world's Boss Quiz), newest first. Each " +
    "certificate's xpEarned/accuracyPct is a snapshot from the moment it was issued, never " +
    "recomputed later.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The caller's certificates",
      content: { "application/json": { schema: CertificateListResponseSchema } },
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
  return ok(await listMyCertificates(user.id));
});
