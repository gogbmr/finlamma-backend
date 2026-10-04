import { requireUser } from "@/lib/auth";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { NotificationPrefsResponseSchema, UpdateNotificationPrefsInputSchema } from "@/server/notifications/schemas";
import { getMyNotificationPrefs, updateMyNotificationPrefs } from "@/server/notifications/service";
import { requireFullAccess } from "@/server/onboarding/service";

const UNAUTHENTICATED_RESPONSE = {
  401: {
    description: "Not signed in",
    content: {
      "application/json": {
        schema: ErrorResponseSchema,
        example: { error: { code: "UNAUTHENTICATED", message: "Sign-in required" } },
      },
    },
  },
} as const;

registry.registerPath({
  method: "get",
  path: "/api/v1/me/notification-prefs",
  summary: "Get my notification preferences (SET-07)",
  description:
    "quietHours is always resolved - the caller's own override if set, else the admin-configured " +
    "global default (settings_kv) - so the client never needs its own copy of the default.",
  tags: ["Notifications"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "The caller's prefs", content: { "application/json": { schema: NotificationPrefsResponseSchema } } },
    ...UNAUTHENTICATED_RESPONSE,
  },
});

export const GET = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await requireFullAccess(user);
  return ok(await getMyNotificationPrefs({ id: user.id }));
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/me/notification-prefs",
  summary: "Update my notification preferences",
  description:
    "Every field is optional - only what's provided changes. quietHours: null clears a personal " +
    "override back to the global default.",
  tags: ["Notifications"],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { "application/json": { schema: UpdateNotificationPrefsInputSchema } } } },
  responses: {
    200: { description: "The updated prefs", content: { "application/json": { schema: NotificationPrefsResponseSchema } } },
    ...UNAUTHENTICATED_RESPONSE,
  },
});

export const PATCH = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await requireFullAccess(user);
  const body = UpdateNotificationPrefsInputSchema.parse(await req.json());
  return ok(await updateMyNotificationPrefs({ id: user.id }, body, requestMeta(req.headers)));
});
