import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { PulseCheckCurrentResponseSchema } from "@/server/pulse-check/schemas";
import { getCurrentPulseCheck } from "@/server/pulse-check/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/pulse-check/current",
  summary: "Get today's Pulse Check meta (NW-03)",
  description:
    "The CTA card's data: question count, per-question timer, max VM payout (best-case, before " +
    "D51's daily cap), and whether the caller already has an in-progress or completed attempt " +
    "today. editionId is null if today's edition hasn't been built yet (no eligible questions " +
    "published) - POST .../start builds it lazily on first use.",
  tags: ["Pulse Check"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Today's Pulse Check meta",
      content: { "application/json": { schema: PulseCheckCurrentResponseSchema } },
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
  return ok(await getCurrentPulseCheck(user.id));
});
