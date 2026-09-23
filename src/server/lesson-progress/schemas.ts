import { z } from "zod";

export const LessonIdParamSchema = z.object({ id: z.string().uuid() });

// Server-timed anti-farming anchor (Phase 3 Checkpoint 3, same reasoning as
// D21's serveStep for graded lessons): `startedAt` is stamped here, never
// trusted from the client, and POST .../complete measures elapsed time from
// it. Re-serving an already-served (or already-completed) lesson is
// idempotent - the SAME startedAt comes back, never a new one.
export const ServeUngradedLessonResponseSchema = z.object({
  data: z.object({
    lessonId: z.string().uuid(),
    status: z.enum(["in_progress", "completed"]),
    startedAt: z.string().datetime().openapi({
      description: "Server-stamped serve time (ISO 8601 UTC) - what .../complete measures elapsed time from.",
    }),
  }),
});

export const CompleteUngradedLessonResponseSchema = z.object({
  data: z.object({
    lessonId: z.string().uuid(),
    status: z.literal("completed"),
    completedAt: z.string().datetime(),
    credited: z.boolean().openapi({
      description:
        "True only the first time this lesson was completed for this user - a later idempotent " +
        "replay of an already-completed lesson returns credited: false (no re-credit).",
    }),
  }),
});
