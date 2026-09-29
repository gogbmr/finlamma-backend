import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { getPublicProfile } from "@/server/arena/service";
import { PublicProfileResponseSchema } from "@/server/arena/schemas";

registry.registerPath({
  method: "get",
  path: "/api/v1/users/{userId}/public-profile",
  summary: "Get a learner's public Arena profile (AR-20)",
  description:
    "Opened by tapping any other learner's name/avatar in Arena. A strict allowlist: kid-safe " +
    "display name (first name + last initial, never a full name or photo), level, rank title, " +
    "unlocked badges, selected about-me chips (preset only, never free text - " +
    "docs/ARCHITECTURE.md D36), this week's XP, learning streak, quiz accuracy and current " +
    "world progress. Never returns email, phone, date of birth, state, parent contact, " +
    "school/class or `bio` - `users.bio` stays private to its owner forever.",
  tags: ["Arena"],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ userId: z.string().uuid() }) },
  responses: {
    200: {
      description: "The learner's public profile",
      content: { "application/json": { schema: PublicProfileResponseSchema } },
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
      description: "Learner not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "Learner not found" } },
        },
      },
    },
  },
});

export const GET = withErrors(
  async (req: Request, { params }: { params: Promise<{ userId: string }> }) => {
    const user = await requireUser(req);
    await requireFullAccess(user);
    const { userId } = await params;
    return ok(await getPublicProfile(userId));
  },
);
