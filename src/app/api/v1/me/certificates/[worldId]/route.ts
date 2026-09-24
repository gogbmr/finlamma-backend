import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { CertificateResponseSchema, WorldIdParamSchema } from "@/server/certificates/schemas";
import { getMyCertificate } from "@/server/certificates/service";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/certificates/{worldId}",
  summary: "Get my certificate for a world (PR-36)",
  description: "The caller's certificate for a specific world, if they've earned one.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  request: { params: WorldIdParamSchema },
  responses: {
    200: {
      description: "The caller's certificate for this world",
      content: { "application/json": { schema: CertificateResponseSchema } },
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
  },
});

export const GET = withErrors(
  async (req: Request, { params }: { params: Promise<{ worldId: string }> }) => {
    const user = await requireUser(req);
    await requireFullAccess(user);
    const { worldId } = WorldIdParamSchema.parse(await params);
    return ok(await getMyCertificate(user.id, worldId));
  },
);
