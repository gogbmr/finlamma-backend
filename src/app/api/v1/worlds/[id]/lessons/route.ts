import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { LessonSummaryListResponseSchema } from "@/server/lessons/schemas";
import { getPublicLessonsForWorld } from "@/server/lessons/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/worlds/{id}/lessons",
  summary: "List a world's published lessons",
  description:
    "The journey-map node list for one world (WH-12): id, chapter, step, kind, title, blurb - " +
    "no `content`, which is only needed once a specific lesson is actually opened (see " +
    "GET /api/v1/lessons/{id}). Per-user node state (done/current/next/locked) is added once " +
    "lesson_progress exists (Checkpoint 5) - for now this is the world's lesson list only, " +
    "ordered by chapter then step.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: "The world's published lessons, ordered",
      content: { "application/json": { schema: LessonSummaryListResponseSchema } },
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

export const GET = withErrors(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser(req);
    await requireFullAccess(user);
    const { id } = await params;
    return ok(await getPublicLessonsForWorld(id));
  },
);
