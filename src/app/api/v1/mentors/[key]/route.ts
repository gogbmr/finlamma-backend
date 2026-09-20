import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { MentorKeySchema, MentorResponseSchema } from "@/server/mentors/schemas";
import { getPublicMentorByKey } from "@/server/mentors/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/mentors/{key}",
  summary: "Get a published mentor",
  description: "A single mentor stage by its stable key (e.g. \"baby\"). 404 if not published.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ key: MentorKeySchema }) },
  responses: {
    200: {
      description: "The published mentor",
      content: { "application/json": { schema: MentorResponseSchema } },
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
      description: "No published mentor with this key",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No published mentor with key \"baby\"" } },
        },
      },
    },
  },
});

export const GET = withErrors(
  async (req: Request, { params }: { params: Promise<{ key: string }> }) => {
    const user = await requireUser(req);
    await requireFullAccess(user);
    const { key } = await params;
    return ok(await getPublicMentorByKey(key));
  },
);
