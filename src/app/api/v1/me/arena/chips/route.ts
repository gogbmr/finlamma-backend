import { requireUser } from "@/lib/auth";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { getMySelectedChips, setMySelectedChips } from "@/server/arena/service";
import { MySelectedChipsResponseSchema, SetMySelectedChipsRequestSchema } from "@/server/arena/schemas";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/arena/chips",
  summary: "Get my selected about-me chips (AR-20)",
  tags: ["Arena"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The caller's currently-selected chips",
      content: { "application/json": { schema: MySelectedChipsResponseSchema } },
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

registry.registerPath({
  method: "put",
  path: "/api/v1/me/arena/chips",
  summary: "Set my selected about-me chips (AR-20)",
  description: "Replaces the caller's whole chip selection - at most 3, and every id must be an active chip.",
  tags: ["Arena"],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { "application/json": { schema: SetMySelectedChipsRequestSchema } } } },
  responses: {
    200: {
      description: "The caller's new chip selection",
      content: { "application/json": { schema: MySelectedChipsResponseSchema } },
    },
    400: {
      description: "Too many chips, or one isn't currently active",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "VALIDATION_FAILED", message: "Pick at most 3 chips" } },
        },
      },
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
  return ok(await getMySelectedChips(user.id));
});

export const PUT = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await requireFullAccess(user);
  const { chipIds } = SetMySelectedChipsRequestSchema.parse(await req.json());
  await setMySelectedChips(user, chipIds, requestMeta(req.headers));
  return ok(await getMySelectedChips(user.id));
});
