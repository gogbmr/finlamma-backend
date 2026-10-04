import { requireUser } from "@/lib/auth";
import { captureEvent } from "@/lib/analytics";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { AcceptLegalResponseSchema } from "@/server/legal/schemas";
import { acceptLegal } from "@/server/legal/service";
import { hasFullAccess } from "@/server/onboarding/service";

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
  const hadFullAccess = await hasFullAccess(user);
  const result = await acceptLegal(user, requestMeta(req.headers));
  // `signup_completed` (docs/ARCHITECTURE.md D69) fires exactly once, on the
  // actual limited->full transition - never on a routine re-accept by a
  // user who already had full access. For a minor whose parent consents
  // AFTER this self-accept, the transition instead fires from the
  // parent-consent-confirm action (src/server/onboarding/service.ts).
  if (!hadFullAccess && (await hasFullAccess(user))) {
    captureEvent(user.id, "signup_completed");
  }
  return ok(result);
});
