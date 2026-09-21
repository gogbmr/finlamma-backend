import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { LessonDetailResponseSchema } from "@/server/lessons/schemas";
import { getPublicLesson } from "@/server/lessons/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/lessons/{id}",
  summary: "Get a published lesson",
  description:
    "Full content for a single published lesson - what the Lesson Flow engine renders. Never " +
    "includes a question's correct answer, only a reference id (see docs/DATA_MODEL.md's " +
    "single-source-of-truth rule for questions, Checkpoint 5).",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: "The published lesson",
      content: { "application/json": { schema: LessonDetailResponseSchema } },
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
      description: "No published lesson with this id",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No published lesson with this id" } },
        },
      },
    },
  },
});

export const GET = withErrors(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser(req);
    await requireFullAccess(user);
    const { id } = await params;
    return ok(await getPublicLesson(id));
  },
);
