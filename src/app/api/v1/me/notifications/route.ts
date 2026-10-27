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
  description:
    "The caller's own notifications only, newest first, cursor-paginated, already resolved to " +
    "their own language. `data` is a discriminated union keyed on `kind` (app ask A9) - exactly " +
    "6 kinds ever fire, confirmed against every real notifyUser() call site in the codebase: " +
    "`boss_battle` carries `{ worldId }` (the next world this learner just unlocked), " +
    "`market_news` carries `{ newsStoryId }` (pass to GET /api/v1/news/{id} for the full " +
    "story), and `streak_risk`/`session_goal`/`cheer_received`/`league_rank_change` all carry " +
    "`data: null` - none of those four kinds has ever passed a data argument.",
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
