import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { MentorListResponseSchema } from "@/server/mentors/schemas";
import { getPublicMentors } from "@/server/mentors/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/mentors",
  summary: "List published mentors",
  description:
    "The mentor evolution stages (Baby/Father/Grandpa Lamma), each covering a fixed range of " +
    "worlds, ordered by their display order. Only published mentors are returned.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Published mentors, ordered",
      content: { "application/json": { schema: MentorListResponseSchema } },
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
  return ok(await getPublicMentors());
});
