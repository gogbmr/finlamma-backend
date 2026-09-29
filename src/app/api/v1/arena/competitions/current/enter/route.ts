import { requireUser } from "@/lib/auth";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { enterCurrentCompetition } from "@/server/competitions/service";
import { EnterCompetitionResponseSchema } from "@/server/competitions/schemas";

registry.registerPath({
  method: "post",
  path: "/api/v1/arena/competitions/current/enter",
  summary: "Enter the current Monthly Competition (AR-14)",
  description:
    "Creates the caller's entry, seeded with the competition's virtual capital (never V Money - " +
    "docs/ARCHITECTURE.md D57). Calling this again after already entering just returns the " +
    "existing entry, not an error. Requires trading to already be unlocked, and only accepts " +
    "entries within the first part of the competition's window (docs/ARCHITECTURE.md D59, " +
    "settings_kv-tunable) - closes a late-entry-lucky-trade gap.",
  tags: ["Arena"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The caller's competition entry (new or existing)",
      content: { "application/json": { schema: EnterCompetitionResponseSchema } },
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
      description: "Onboarding incomplete, or trading isn't unlocked yet",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "FORBIDDEN", message: "Trading is locked until you clear more worlds" } },
        },
      },
    },
    404: {
      description: "No active competition right now",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No active competition right now" } },
        },
      },
    },
    409: {
      description: "The entry window for this competition has closed",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "COMPETITION_ENTRY_CLOSED", message: "Entry for this competition has closed" } },
        },
      },
    },
  },
});

export const POST = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await requireFullAccess(user);
  const entry = await enterCurrentCompetition(user, requestMeta(req.headers));
  return ok({
    id: entry.id,
    competitionId: entry.competitionId,
    cashPaise: entry.cashPaise,
    qtyHeld: entry.qtyHeld,
    enteredAt: entry.enteredAt.toISOString(),
  });
});
