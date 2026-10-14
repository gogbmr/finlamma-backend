import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { TimeStatsResponseSchema } from "@/server/session-time/schemas";
import { getTodaySessionSeconds } from "@/server/session-time/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/stats/time",
  summary: "Get my time-studied-today stat (World Home header TIME tile, WH-01)",
  description:
    "Today's (IST) running total from session_time_daily, the same total POST " +
    "/me/session-time returns as a byproduct of recording a ping - this is a plain read, with " +
    "no side effect. Day boundaries are computed server-side in IST (Asia/Kolkata) from the " +
    "server's own clock - never a client-reported date or timezone.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The caller's time-studied-today stat",
      content: { "application/json": { schema: TimeStatsResponseSchema } },
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
  return ok({ todaySeconds: await getTodaySessionSeconds(user.id) });
});
