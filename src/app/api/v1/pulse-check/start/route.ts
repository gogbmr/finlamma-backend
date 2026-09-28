import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { PulseCheckStartResponseSchema } from "@/server/pulse-check/schemas";
import { startAttempt } from "@/server/pulse-check/service";

registry.registerPath({
  method: "post",
  path: "/api/v1/pulse-check/start",
  summary: "Start (or resume) today's Pulse Check attempt (NW-12)",
  description:
    "Builds today's edition on first use if it doesn't exist yet (a random selection of " +
    "published, AI-drafted-then-staff-published questions, size and formats per the News " +
    "Desk's quiz generator settings). Idempotent in spirit, not by header: a caller with an " +
    "already-in-progress attempt for today gets that same attempt back (resumed: true) rather " +
    "than a new one. A learner who already completed today's edition CAN start a fresh attempt " +
    "(replay) - per docs/ARCHITECTURE.md D51, a replay is graded and playable but never earns " +
    "further VM once the edition's one credit-eligible slot is already used.",
  tags: ["Pulse Check"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The attempt to play",
      content: { "application/json": { schema: PulseCheckStartResponseSchema } },
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
    404: {
      description: "No Pulse Check questions are available yet today",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No Pulse Check questions are available yet today" } },
        },
      },
    },
  },
});

export const POST = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await requireFullAccess(user);
  return ok(await startAttempt(user));
});
