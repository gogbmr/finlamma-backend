import { z } from "zod";
import { registry } from "@/lib/openapi";
import { QuestionFormatSchema } from "@/server/questions/schemas";
import { LocalizedTextSchema } from "@/server/shared/schemas";

// --- App-facing (registered in OpenAPI) ---

// Deliberately NO answer/explanation field anywhere in this schema - see
// docs/ARCHITECTURE.md D21's anti-leak rule. `payload` is per-format (see
// src/server/questions/schemas.ts's payloadSchemaForFormat) so it's typed
// generically here, same as questions.payload itself.
export const ServeStepResponseSchema = registry.register(
  "ServeStepResponse",
  z.object({
    data: z.object({
      attemptId: z.string().uuid(),
      stepIndex: z.number().int().positive().openapi({ example: 1 }),
      totalSteps: z.number().int().positive().openapi({ example: 5 }),
      questionId: z.string().uuid(),
      format: QuestionFormatSchema,
      prompt: LocalizedTextSchema,
      payload: z.record(z.string(), z.unknown()),
      timerSeconds: z.number().int().positive().openapi({
        example: 12,
        description: "Allotted seconds to answer, captured at serve time.",
      }),
      servedAt: z.string().datetime().openapi({
        description: "Server-stamped serve time (ISO 8601 UTC) - the clock this step's timer runs from.",
      }),
    }),
  }),
);

export const SubmitAnswerRequestSchema = z.object({
  answer: z.unknown().openapi({
    description: "Shape depends on the question's format - see the matching *AnswerSchema in " +
      "src/server/questions/schemas.ts (e.g. { correctIndex } for single_select).",
  }),
});
export type SubmitAnswerInput = z.infer<typeof SubmitAnswerRequestSchema>;

// The ONLY response that ever includes a question's answer/explanation -
// and only for the one question this submission was for, never any other
// step in the lesson. See docs/ARCHITECTURE.md D21.
export const SubmitAnswerResponseSchema = registry.register(
  "SubmitAnswerResponse",
  z.object({
    data: z.object({
      attemptId: z.string().uuid(),
      stepIndex: z.number().int().positive(),
      totalSteps: z.number().int().positive(),
      isCorrect: z.boolean(),
      timedOut: z.boolean().openapi({
        description: "True if the server-measured elapsed time exceeded the allotted timer.",
      }),
      correctAnswer: z.unknown().openapi({
        description: "This question's correct answer - only ever included here, after grading.",
      }),
      explanation: LocalizedTextSchema,
      xpAwardedPreview: z.number().int().openapi({
        description:
          "Preview only (docs/ARCHITECTURE.md D17) - not yet credited to any ledger, Phase 3 owns that.",
      }),
      speedBonusAwarded: z.boolean(),
      feverActive: z.boolean(),
      comboAfter: z.number().int().nonnegative(),
      isAttemptComplete: z.boolean(),
      totalXpPreview: z.number().int().nullable().openapi({
        description: "Sum of every step's xpAwardedPreview for this attempt - filled only once complete.",
      }),
    }),
  }),
);

export const LessonIdParamSchema = z.object({ id: z.string().uuid() });
export const LessonStepParamsSchema = z.object({
  id: z.string().uuid(),
  n: z.coerce.number().int().positive(),
});
