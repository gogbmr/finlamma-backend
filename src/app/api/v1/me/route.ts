import { requireUser } from "@/lib/auth";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import {
  DeleteMeResponseSchema,
  MeResponseSchema,
  UpdateMeRequestSchema,
} from "@/server/users/schemas";
import { deleteMe, getMe, updateMe } from "@/server/users/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/me",
  summary: "Get my profile",
  description: "Returns the signed-in user's own profile.",
  tags: ["Users"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The caller's profile",
      content: { "application/json": { schema: MeResponseSchema } },
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

registry.registerPath({
  method: "patch",
  path: "/api/v1/me",
  summary: "Update my preferences",
  description:
    "Updates language and/or theme - the only profile fields this API owns. Name, email and " +
    "phone are Clerk-owned identity fields, changed through the app's account settings and " +
    "synced in automatically by the Clerk webhook.",
  tags: ["Users"],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: UpdateMeRequestSchema } } },
  },
  responses: {
    200: {
      description: "Updated profile",
      content: { "application/json": { schema: MeResponseSchema } },
    },
    400: {
      description: "Validation failed (e.g. neither field provided)",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: {
              code: "VALIDATION_FAILED",
              message: "Request validation failed",
              details: { _errors: ["Provide at least one of language or theme"] },
            },
          },
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
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/me",
  summary: "Delete my account",
  description:
    "Permanently deletes the Clerk identity and anonymizes the DB row in place (email, phone " +
    "and name are cleared; ledger/trading/leaderboard history is kept for integrity). Cannot " +
    "be undone.",
  tags: ["Users"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Account deleted",
      content: { "application/json": { schema: DeleteMeResponseSchema } },
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
    503: {
      description: "Could not delete the account right now - retry",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: { code: "SERVICE_UNAVAILABLE", message: "Could not delete account right now" },
          },
        },
      },
    },
  },
});

export const GET = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  return ok(getMe(user));
});

export const PATCH = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  const input = UpdateMeRequestSchema.parse(await req.json());
  const updated = await updateMe(user, input, requestMeta(req.headers));
  return ok(updated);
});

export const DELETE = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await deleteMe(user, requestMeta(req.headers));
  return ok({ deleted: true as const });
});
