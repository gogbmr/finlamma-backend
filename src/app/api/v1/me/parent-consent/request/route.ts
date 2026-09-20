import { requireUser } from "@/lib/auth";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import {
  RequestParentConsentRequestSchema,
  RequestParentConsentResponseSchema,
} from "@/server/onboarding/schemas";
import { requestParentConsent } from "@/server/onboarding/service";

registry.registerPath({
  method: "post",
  path: "/api/v1/me/parent-consent/request",
  summary: "Request parental consent",
  description:
    "For an under-18 account: emails the given parent/guardian a magic link to a public " +
    "consent page. Opening that link does nothing by itself - only the parent's own " +
    "'I consent' action there records anything. Safe to call again to resend (subject to a " +
    "60s cooldown and a daily cap, both per account and per parent email) or to change the " +
    "parent's details before they've acted.",
  tags: ["Onboarding"],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: RequestParentConsentRequestSchema } } },
  },
  responses: {
    200: {
      description: "Consent email sent (or queued)",
      content: { "application/json": { schema: RequestParentConsentResponseSchema } },
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
      description:
        "Consent isn't needed (no date of birth yet, account is 18+, already consented), the " +
        "parent email equals the account's own email, or that parent email is already linked " +
        "to the maximum number of accounts",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: { code: "CONSENT_NOT_NEEDED", message: "Set your date of birth first" },
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
  const input = RequestParentConsentRequestSchema.parse(await req.json());
  return ok(await requestParentConsent(user, input, requestMeta(req.headers)));
});
