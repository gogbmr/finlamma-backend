import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { CertificatePdfResponseSchema, WorldIdParamSchema } from "@/server/certificates/schemas";
import { getCertificatePdfUrl } from "@/server/certificates/service";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/certificates/{worldId}/pdf",
  summary: "Get a signed download URL for my certificate PDF (PR-37/PR-38)",
  description:
    "Renders the PDF on first request (server-side, no headless browser) and uploads it to " +
    "storage; every later call returns a fresh signed URL to the same file. The app downloads " +
    "or shares this URL directly - Finlamma never sends it anywhere on the learner's behalf.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  request: { params: WorldIdParamSchema },
  responses: {
    200: {
      description: "A short-lived signed URL to the certificate PDF",
      content: { "application/json": { schema: CertificatePdfResponseSchema } },
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
      description: "No certificate for this world yet",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No certificate for this world yet" } },
        },
      },
    },
    503: {
      description: "Storage is not configured",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "SERVICE_UNAVAILABLE", message: "Storage is not configured" } },
        },
      },
    },
  },
});

export const GET = withErrors(
  async (req: Request, { params }: { params: Promise<{ worldId: string }> }) => {
    const user = await requireUser(req);
    await requireFullAccess(user);
    const { worldId } = WorldIdParamSchema.parse(await params);
    const url = await getCertificatePdfUrl(user, worldId);
    return ok({ url });
  },
);
