import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { UnreadNotificationCountResponseSchema } from "@/server/notifications/schemas";
import { getMyUnreadNotificationCount } from "@/server/notifications/service";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/notifications/unread-count",
  summary: "Get my unread notification count (WH-18)",
  description: "Backs the bell icon's badge count - a dedicated endpoint rather than a query flag on the feed list, so the client can poll it cheaply without paging through notifications.",
  tags: ["Notifications"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The caller's unread count",
      content: { "application/json": { schema: UnreadNotificationCountResponseSchema } },
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

export const GET = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await requireFullAccess(user);
  const count = await getMyUnreadNotificationCount({ id: user.id });
  return ok({ count });
});
