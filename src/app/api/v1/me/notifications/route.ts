import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { okList, parseLimit, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { NotificationsListResponseSchema } from "@/server/notifications/schemas";
import { listMyNotifications } from "@/server/notifications/service";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/notifications",
  summary: "Get my notification feed (PR-29)",
  description: "The caller's own notifications only, newest first, cursor-paginated, already resolved to their own language.",
  tags: ["Notifications"],
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      limit: z.string().optional().openapi({ example: "20" }),
      cursor: z.string().optional(),
    }),
  },
  responses: {
    200: { description: "A page of the caller's notifications", content: { "application/json": { schema: NotificationsListResponseSchema } } },
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
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get("limit"));
  const { data, nextCursor } = await listMyNotifications({ id: user.id }, { limit, cursor: searchParams.get("cursor") });
  return okList(data, nextCursor);
});
