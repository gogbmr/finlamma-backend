import { requireUser } from "@/lib/auth";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { ResendLegalReapprovalResponseSchema } from "@/server/onboarding/schemas";
import { resendReapprovalRequests } from "@/server/onboarding/service";

registry.registerPath({
  method: "post",
  path: "/api/v1/me/legal/reapproval/resend",
  summary: "Resend pending parent re-approval email(s)",
  description:
    "For a minor whose parent already consented once, but a later material legal-document " +
    "change now needs a fresh parent re-approval (see requiresParentReapproval on " +
    "GET /api/v1/me/legal-status): resends the re-approval email(s), each with a fresh 7-day " +
    "single-use link and a rotated withdraw link. Subject to the same 60s cooldown and daily " +
    "cap as the original consent-request resend flow.",
  tags: ["Legal"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Re-approval email(s) resent",
      content: { "application/json": { schema: ResendLegalReapprovalResponseSchema } },
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
    409: {
      description: "There's no pending re-approval for this account",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: { code: "CONSENT_NOT_NEEDED", message: "There's no pending re-approval for this account" },
          },
        },
      },
    },
    429: {
      description: "Resend cooldown or daily cap reached",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: {
              code: "RESEND_TOO_SOON",
              message: "Please wait a bit before requesting another email",
              details: { retryAfterSeconds: 42 },
            },
          },
        },
      },
    },
  },
});

export const POST = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  return ok(await resendReapprovalRequests(user, requestMeta(req.headers)));
});
