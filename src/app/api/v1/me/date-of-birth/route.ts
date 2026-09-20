import { requireUser } from "@/lib/auth";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { SetDateOfBirthRequestSchema, SetDateOfBirthResponseSchema } from "@/server/onboarding/schemas";
import { setDateOfBirth } from "@/server/onboarding/service";

registry.registerPath({
  method: "patch",
  path: "/api/v1/me/date-of-birth",
  summary: "Set my date of birth (once)",
  description:
    "Collected once at onboarding - determines whether the account needs parental consent. " +
    "Can only be set once through this endpoint; a second call fails with CONFLICT. Only " +
    "staff can correct a mistake after that, with a logged reason.",
  tags: ["Onboarding"],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: SetDateOfBirthRequestSchema } } },
  },
  responses: {
    200: {
      description: "Date of birth recorded",
      content: { "application/json": { schema: SetDateOfBirthResponseSchema } },
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
      description: "Date of birth is already set",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: {
              code: "CONFLICT",
              message: "Date of birth is already set - contact support to correct it",
            },
          },
        },
      },
    },
  },
});

export const PATCH = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  const input = SetDateOfBirthRequestSchema.parse(await req.json());
  return ok(await setDateOfBirth(user, input, requestMeta(req.headers)));
});
