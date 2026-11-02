import { z } from "zod";
import { registry } from "@/lib/openapi";
import {
  FillBlankAnswerSchema,
  FillBlankPayloadSchema,
  MatchPairsAnswerSchema,
  MatchPairsPayloadSchema,
  NumberGuessAnswerSchema,
  NumberGuessPayloadSchema,
  OrderingAnswerSchema,
  OrderingPayloadSchema,
  SingleSelectAnswerSchema,
  SingleSelectPayloadSchema,
  SortBucketsAnswerSchema,
  SortBucketsPayloadSchema,
  SpotMistakeAnswerSchema,
  SpotMistakePayloadSchema,
} from "@/server/questions/schemas";
import { LocalizedTextSchema } from "@/server/shared/schemas";

// --- App-facing (registered in OpenAPI) ---

// Fields shared by every format's served-step variant below. Each variant
// repeats these (same "spread shared fields into each discriminated-union
// branch" pattern as src/server/notifications/schemas.ts's
// NotificationResponseSchema and src/server/portfolio/schemas.ts's
// PortfolioTradeRowSchema) so `format` and `payload` stay tied together as
// one real Zod discriminated union, not two independent sibling fields.
const SHARED_SERVE_STEP_FIELDS = {
  attemptId: z.string().uuid(),
  stepIndex: z.number().int().positive().openapi({ example: 1 }),
  totalSteps: z.number().int().positive().openapi({ example: 5 }),
  questionId: z.string().uuid(),
  prompt: LocalizedTextSchema,
  timerSeconds: z.number().int().positive().openapi({
    example: 12,
    description: "Allotted seconds to answer, captured at serve time.",
  }),
  servedAt: z.string().datetime().openapi({
    description: "Server-stamped serve time (ISO 8601 UTC) - the clock this step's timer runs from.",
  }),
};

// SECURITY (question-shapes branch, app asks batch item B): every
// *PayloadSchema below (src/server/questions/schemas.ts) is deliberately
// answer-free by construction - the real answer is a separate DB column
// (src/db/schema/questions.ts), never merged into payload, so there is
// nothing here to leak. Proven per format by a "serve response has no
// answer-bearing keys" test in src/server/quiz-attempts/service.test.ts.
// Deliberately NO answer/explanation field anywhere in this schema - see
// docs/ARCHITECTURE.md D21's anti-leak rule.
const ServeStepDataSchema = z.discriminatedUnion("format", [
  z.object({ ...SHARED_SERVE_STEP_FIELDS, format: z.literal("single_select"), payload: SingleSelectPayloadSchema }),
  z.object({ ...SHARED_SERVE_STEP_FIELDS, format: z.literal("ordering"), payload: OrderingPayloadSchema }),
  z.object({ ...SHARED_SERVE_STEP_FIELDS, format: z.literal("sort_buckets"), payload: SortBucketsPayloadSchema }),
  z.object({ ...SHARED_SERVE_STEP_FIELDS, format: z.literal("fill_blank"), payload: FillBlankPayloadSchema }),
  z.object({ ...SHARED_SERVE_STEP_FIELDS, format: z.literal("match_pairs"), payload: MatchPairsPayloadSchema }),
  z.object({ ...SHARED_SERVE_STEP_FIELDS, format: z.literal("spot_mistake"), payload: SpotMistakePayloadSchema }),
  z.object({ ...SHARED_SERVE_STEP_FIELDS, format: z.literal("number_guess"), payload: NumberGuessPayloadSchema }),
]);

export const ServeStepResponseSchema = registry.register(
  "ServeStepResponse",
  z.object({ data: ServeStepDataSchema }),
);

export const SubmitAnswerRequestSchema = z.object({
  answer: z.unknown().openapi({
    description: "Shape depends on the question's format - see the matching *AnswerSchema in " +
      "src/server/questions/schemas.ts (e.g. { correctIndex } for single_select), and the " +
      "documented SubmitAnswerRequest union below for the exact per-format shapes. The server " +
      "always validates/grades against the REAL format of the step being answered, looked up " +
      "server-side from the served question - never trusted from the client, so don't send a " +
      "`format` field here; it would be ignored.",
  }),
});
export type SubmitAnswerInput = z.infer<typeof SubmitAnswerRequestSchema>;

// Documentation-only precise union of the 7 real answer shapes (question-
// shapes branch, mobile app asks batch). The actual runtime parse above
// (SubmitAnswerRequestSchema, used by src/app/api/v1/lessons/[id]/steps/
// [n]/answer/route.ts's req.json() parse) deliberately stays permissive -
// real validation happens inside submitAnswer() via answerSchemaForFormat
// (src/server/questions/schemas.ts), which already knows this step's REAL
// format server-side. So this schema can never reject a request the real
// endpoint would accept, or accept one it would reject - it exists purely
// so the generated contract (docs/API_ENDPOINTS.md) shows the mobile team
// the exact 7 possible request bodies instead of "any". Used only as this
// endpoint's registerPath() request body schema, never for actual parsing.
// Not a true z.discriminatedUnion: the wire body never carries `format` (by
// design - D21, the server never trusts a client-supplied format), so
// there's no shared literal field across these 7 shapes to key on; this is
// a plain union of the 7 precise shapes instead.
export const SubmitAnswerRequestDocSchema = registry.register(
  "SubmitAnswerRequest",
  z.object({
    answer: z
      .union([
        SingleSelectAnswerSchema,
        OrderingAnswerSchema,
        SortBucketsAnswerSchema,
        FillBlankAnswerSchema,
        MatchPairsAnswerSchema,
        SpotMistakeAnswerSchema,
        NumberGuessAnswerSchema,
      ])
      .openapi({
        description:
          "One of the 7 shapes below, matching the format of the step being answered (returned " +
          "by the matching serve call's `format` field). Never send a `format` field alongside " +
          "`answer` - the server already knows it and would ignore one anyway.",
      }),
  }),
);

// Fields shared by every format's graded-answer variant below - same
// shared-fields-per-branch pattern as SHARED_SERVE_STEP_FIELDS above.
const SHARED_SUBMIT_ANSWER_FIELDS = {
  attemptId: z.string().uuid(),
  stepIndex: z.number().int().positive(),
  totalSteps: z.number().int().positive(),
  isCorrect: z.boolean(),
  timedOut: z.boolean().openapi({
    description: "True if the server-measured elapsed time exceeded the allotted timer.",
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
  // App asks batch, item A5: V Money actually credited by THIS call,
  // in paise. null on every step except the one that completes the
  // attempt and passes - this is a flat per-lesson reward
  // (reward_rules.defaultVm), never a per-question preview like
  // xpAwardedPreview, and it's the real credit, not a guess at what a
  // retry would earn.
  vmAwardedPaise: z.number().int().nonnegative().nullable().openapi({
    example: 5000,
  }),
  // Question-shapes branch, item 4: a display-only cumulative V Money
  // total for this attempt, named for symmetry with totalXpPreview (same
  // "null until the attempt completes" convention). Unlike XP, V Money
  // here has exactly ONE source per attempt - the flat lesson-completion
  // reward computed by src/server/economy/service.ts's
  // creditLessonCompletion, never a per-question amount summed across
  // steps - so this field is always exactly equal to vmAwardedPaise, by
  // construction (src/server/quiz-attempts/service.ts's buildAnswerResponse
  // assigns both from the same value). Proved by a test in
  // service.test.ts that checks it against the real vmoney_ledger row.
  totalVmAwardedPreviewPaise: z.number().int().nonnegative().nullable().openapi({
    description:
      "Cumulative V Money this attempt will credit, in paise - guaranteed equal to vmAwardedPaise " +
      "today (there is only one VM source per attempt). null until the attempt completes.",
    example: 5000,
  }),
};

// The ONLY response that ever includes a question's answer/explanation -
// and only for the one question this submission was for, never any other
// step in the lesson. See docs/ARCHITECTURE.md D21. `format` (new) lets
// `correctAnswer`'s shape be a real discriminated union instead of
// `z.unknown()` - purely additive (old clients ignore an unknown field).
const SubmitAnswerDataSchema = z.discriminatedUnion("format", [
  z.object({ ...SHARED_SUBMIT_ANSWER_FIELDS, format: z.literal("single_select"), correctAnswer: SingleSelectAnswerSchema }),
  z.object({ ...SHARED_SUBMIT_ANSWER_FIELDS, format: z.literal("ordering"), correctAnswer: OrderingAnswerSchema }),
  z.object({ ...SHARED_SUBMIT_ANSWER_FIELDS, format: z.literal("sort_buckets"), correctAnswer: SortBucketsAnswerSchema }),
  z.object({ ...SHARED_SUBMIT_ANSWER_FIELDS, format: z.literal("fill_blank"), correctAnswer: FillBlankAnswerSchema }),
  z.object({ ...SHARED_SUBMIT_ANSWER_FIELDS, format: z.literal("match_pairs"), correctAnswer: MatchPairsAnswerSchema }),
  z.object({ ...SHARED_SUBMIT_ANSWER_FIELDS, format: z.literal("spot_mistake"), correctAnswer: SpotMistakeAnswerSchema }),
  z.object({ ...SHARED_SUBMIT_ANSWER_FIELDS, format: z.literal("number_guess"), correctAnswer: NumberGuessAnswerSchema }),
]);

export const SubmitAnswerResponseSchema = registry.register("SubmitAnswerResponse", z.object({ data: SubmitAnswerDataSchema }));

export const LessonIdParamSchema = z.object({ id: z.string().uuid() });
export const LessonStepParamsSchema = z.object({
  id: z.string().uuid(),
  n: z.coerce.number().int().positive(),
});
