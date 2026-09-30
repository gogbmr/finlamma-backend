import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { MarkNotificationsReadInputSchema } from "@/server/notifications/schemas";
import { markMyNotificationsRead } from "@/server/notifications/service";
import { requireFullAccess } from "@/server/onboarding/service";

const MarkReadResponseSchema = registry.register(
  "MarkNotificationsReadResponse",
  z.object({ marked: z.literal(true) }),
);

registry.registerPath({
  method: "post",
  path: "/api/v1/me/notifications/mark-read",
  summary: "Mark my notifications as read (PR-29)",
  description:
    "ids omitted: marks every currently-unread notification as read ('mark all read'). ids " +
    "given: marks only those, still scoped to the caller's own notifications - an id belonging " +
    "to someone else is silently ignored, never an error.",
  tags: ["Notifications"],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { "application/json": { schema: MarkNotificationsReadInputSchema } } } },
  responses: {
    200: { description: "Marked", content: { "application/json": { schema: MarkReadResponseSchema } } },
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

export const POST = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await requireFullAccess(user);
  const body = MarkNotificationsReadInputSchema.parse(await req.json());
  await markMyNotificationsRead({ id: user.id }, body.ids);
  return ok({ marked: true as const });
});
