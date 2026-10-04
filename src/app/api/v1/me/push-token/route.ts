import { requireUser } from "@/lib/auth";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import {
  RegisterPushTokenInputSchema,
  RegisterPushTokenResponseSchema,
  UnregisterPushTokenInputSchema,
  UnregisterPushTokenResponseSchema,
} from "@/server/notifications/schemas";
import { registerPushToken, unregisterPushToken } from "@/server/notifications/service";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "post",
  path: "/api/v1/me/push-token",
  summary: "Register this device's Expo push token",
  description:
    "Idempotent - re-registering the same token (e.g. on every app open) just bumps its " +
    "last-seen timestamp. A token already registered to a different account is reassigned to " +
    "the caller, never duplicated.",
  tags: ["Notifications"],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { "application/json": { schema: RegisterPushTokenInputSchema } } } },
  responses: {
    200: { description: "Registered", content: { "application/json": { schema: RegisterPushTokenResponseSchema } } },
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
          example: { error: { code: "FORBIDDEN", message: "Complete onboarding before using this feature" } },
        },
      },
    },
  },
});

export const POST = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await requireFullAccess(user);
  const body = RegisterPushTokenInputSchema.parse(await req.json());
  await registerPushToken({ id: user.id }, body, requestMeta(req.headers));
  return ok({ registered: true as const });
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/me/push-token",
  summary: "Unregister this device's Expo push token",
  description: "Idempotent - unregistering a token that isn't registered (or belongs to someone else) is a no-op.",
  tags: ["Notifications"],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { "application/json": { schema: UnregisterPushTokenInputSchema } } } },
  responses: {
    200: {
      description: "Unregistered",
      content: { "application/json": { schema: UnregisterPushTokenResponseSchema } },
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
          example: { error: { code: "FORBIDDEN", message: "Complete onboarding before using this feature" } },
        },
      },
    },
  },
});

// /phase-audit 7: requireFullAccess added for consistency with every
// sibling Doubt Zone/notifications route (it was previously the one
// inconsistency in an otherwise uniform gate) - not exploitable either way
// since this can only ever remove the caller's own token, but there's no
// reason for this one endpoint to be reachable before onboarding
// completes when nothing else in this app is.
export const DELETE = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await requireFullAccess(user);
  const body = UnregisterPushTokenInputSchema.parse(await req.json());
  await unregisterPushToken({ id: user.id }, body.expoPushToken, requestMeta(req.headers));
  return ok({ unregistered: true as const });
});
