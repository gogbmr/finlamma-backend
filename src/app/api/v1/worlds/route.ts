import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { WorldListResponseSchema } from "@/server/worlds/schemas";
import { getPublicWorlds } from "@/server/worlds/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/worlds",
  summary: "List published worlds",
  description:
    "The published worlds, ordered - staff decide how many exist, no fixed count. Each " +
    "world's `locked` field reflects this signed-in user's own progress - sequential unlock " +
    "only (clearing the previous world's Boss Quiz), never an XP/level gate. The first world " +
    "is always unlocked.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Published worlds, ordered",
      content: { "application/json": { schema: WorldListResponseSchema } },
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
  return ok(await getPublicWorlds(user.id));
});
