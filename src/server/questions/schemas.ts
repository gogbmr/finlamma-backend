import { z } from "zod";
import { LocalizedTextSchema } from "@/server/shared/schemas";

// Text-only, per the Phase 2b Checkpoint 5a kickoff decision - no images/
// glyphs in any format's payload for v1. The correct answer is always a
// separate, language-independent value (index/mapping/order - never a
// LocalizedText), matching the earlier confirmed design: one shared answer
// per question, not one per language - see docs/DATA_MODEL.md.
export const QuestionFormatSchema = z.enum([
  "single_select",
  "ordering",
  "sort_buckets",
  "fill_blank",
  "match_pairs",
  "spot_mistake",
]);
export type QuestionFormat = z.infer<typeof QuestionFormatSchema>;

// --- single_select: pick one of N options (covers MCQ, "options", and a
// tile-grid-style pick-the-odd-one-out, per FEATURE_MAP LF-08/09/16 - all
// three are structurally "a set of choices + one correct index"). ---
export const SingleSelectPayloadSchema = z.object({
  options: z.array(LocalizedTextSchema).min(2),
});
export const SingleSelectAnswerSchema = z.object({
  correctIndex: z.number().int().nonnegative(),
});
export type SingleSelectPayload = z.infer<typeof SingleSelectPayloadSchema>;
export type SingleSelectAnswer = z.infer<typeof SingleSelectAnswerSchema>;

// --- ordering: arrange a word/item pool into the correct sequence
// (FEATURE_MAP LF-10/LF-18). ---
export const OrderingPayloadSchema = z.object({
  pool: z.array(LocalizedTextSchema).min(2),
});
export const OrderingAnswerSchema = z.object({
  correctOrder: z.array(z.number().int().nonnegative()).min(2),
});
export type OrderingPayload = z.infer<typeof OrderingPayloadSchema>;
export type OrderingAnswer = z.infer<typeof OrderingAnswerSchema>;

// --- sort_buckets: tap items into one of exactly 2 labeled buckets
// (FEATURE_MAP LF-17, "2 labeled buckets"). ---
export const SortBucketsPayloadSchema = z.object({
  items: z.array(LocalizedTextSchema).min(2),
  buckets: z.tuple([LocalizedTextSchema, LocalizedTextSchema]),
});
export const SortBucketsAnswerSchema = z.object({
  bucketByItemIndex: z.array(z.union([z.literal(0), z.literal(1)])).min(2),
});
export type SortBucketsPayload = z.infer<typeof SortBucketsPayloadSchema>;
export type SortBucketsAnswer = z.infer<typeof SortBucketsAnswerSchema>;

// --- fill_blank: sentence parts around blanks + a word pool
// (FEATURE_MAP LF-19). N sentence parts frame N-1 blanks, one fill each. ---
export const FillBlankPayloadSchema = z.object({
  sentenceParts: z.array(LocalizedTextSchema).min(2),
  pool: z.array(LocalizedTextSchema).min(1),
});
export const FillBlankAnswerSchema = z.object({
  correctFillIndices: z.array(z.number().int().nonnegative()).min(1),
});
export type FillBlankPayload = z.infer<typeof FillBlankPayloadSchema>;
export type FillBlankAnswer = z.infer<typeof FillBlankAnswerSchema>;

// --- match_pairs: tap-tap pairing between two equal-length columns
// (FEATURE_MAP LF-20). ---
export const MatchPairsPayloadSchema = z.object({
  left: z.array(LocalizedTextSchema).min(2),
  right: z.array(LocalizedTextSchema).min(2),
});
export const MatchPairsAnswerSchema = z.object({
  rightIndexByLeftIndex: z.array(z.number().int().nonnegative()).min(2),
});
export type MatchPairsPayload = z.infer<typeof MatchPairsPayloadSchema>;
export type MatchPairsAnswer = z.infer<typeof MatchPairsAnswerSchema>;

// --- spot_mistake: tap the one wrong line among several (FEATURE_MAP LF-21). ---
export const SpotMistakePayloadSchema = z.object({
  lines: z.array(LocalizedTextSchema).min(2),
});
export const SpotMistakeAnswerSchema = z.object({
  wrongLineIndex: z.number().int().nonnegative(),
});
export type SpotMistakePayload = z.infer<typeof SpotMistakePayloadSchema>;
export type SpotMistakeAnswer = z.infer<typeof SpotMistakeAnswerSchema>;

export function payloadSchemaForFormat(format: QuestionFormat) {
  switch (format) {
    case "single_select":
      return SingleSelectPayloadSchema;
    case "ordering":
      return OrderingPayloadSchema;
    case "sort_buckets":
      return SortBucketsPayloadSchema;
    case "fill_blank":
      return FillBlankPayloadSchema;
    case "match_pairs":
      return MatchPairsPayloadSchema;
    case "spot_mistake":
      return SpotMistakePayloadSchema;
  }
}

export function answerSchemaForFormat(format: QuestionFormat) {
  switch (format) {
    case "single_select":
      return SingleSelectAnswerSchema;
    case "ordering":
      return OrderingAnswerSchema;
    case "sort_buckets":
      return SortBucketsAnswerSchema;
    case "fill_blank":
      return FillBlankAnswerSchema;
    case "match_pairs":
      return MatchPairsAnswerSchema;
    case "spot_mistake":
      return SpotMistakeAnswerSchema;
  }
}

// Cross-field checks Zod's per-schema structural parse can't express on its
// own (e.g. "correctIndex is a number" is structural; "correctIndex is
// actually one of the options" is a bounds check against the payload this
// specific answer belongs to). Returns human-readable messages naming the
// exact problem, e.g. "answer.correctIndex (5) is out of range for 3
// options" - same "name it" philosophy as every other publish gate in this
// phase. Assumes payload/answer already passed their own structural Zod
// parse (callers check that first - see src/server/questions/service.ts).
export function validateAnswerBounds(
  format: QuestionFormat,
  payload: unknown,
  answer: unknown,
): string[] {
  const errors: string[] = [];
  const p = payloadSchemaForFormat(format).safeParse(payload);
  const a = answerSchemaForFormat(format).safeParse(answer);
  if (!p.success || !a.success) return errors; // structural errors are reported separately

  switch (format) {
    case "single_select": {
      const { options } = p.data as SingleSelectPayload;
      const { correctIndex } = a.data as SingleSelectAnswer;
      if (correctIndex >= options.length) {
        errors.push(`answer.correctIndex (${correctIndex}) is out of range for ${options.length} options`);
      }
      break;
    }
    case "ordering": {
      const { pool } = p.data as OrderingPayload;
      const { correctOrder } = a.data as OrderingAnswer;
      if (correctOrder.length !== pool.length) {
        errors.push(`answer.correctOrder has ${correctOrder.length} entries but the pool has ${pool.length} items`);
      } else if (!isPermutation(correctOrder, pool.length)) {
        errors.push("answer.correctOrder must use every pool index exactly once");
      }
      break;
    }
    case "sort_buckets": {
      const { items } = p.data as SortBucketsPayload;
      const { bucketByItemIndex } = a.data as SortBucketsAnswer;
      if (bucketByItemIndex.length !== items.length) {
        errors.push(
          `answer.bucketByItemIndex has ${bucketByItemIndex.length} entries but there are ${items.length} items`,
        );
      }
      break;
    }
    case "fill_blank": {
      const { sentenceParts, pool } = p.data as FillBlankPayload;
      const { correctFillIndices } = a.data as FillBlankAnswer;
      const expectedBlanks = sentenceParts.length - 1;
      if (correctFillIndices.length !== expectedBlanks) {
        errors.push(
          `answer.correctFillIndices has ${correctFillIndices.length} entries but ${sentenceParts.length} sentence parts frame ${expectedBlanks} blank(s)`,
        );
      }
      correctFillIndices.forEach((idx, i) => {
        if (idx >= pool.length) {
          errors.push(`answer.correctFillIndices[${i}] (${idx}) is out of range for ${pool.length} pool words`);
        }
      });
      break;
    }
    case "match_pairs": {
      const { left, right } = p.data as MatchPairsPayload;
      const { rightIndexByLeftIndex } = a.data as MatchPairsAnswer;
      if (rightIndexByLeftIndex.length !== left.length) {
        errors.push(
          `answer.rightIndexByLeftIndex has ${rightIndexByLeftIndex.length} entries but there are ${left.length} left items`,
        );
      }
      rightIndexByLeftIndex.forEach((idx, i) => {
        if (idx >= right.length) {
          errors.push(`answer.rightIndexByLeftIndex[${i}] (${idx}) is out of range for ${right.length} right items`);
        }
      });
      break;
    }
    case "spot_mistake": {
      const { lines } = p.data as SpotMistakePayload;
      const { wrongLineIndex } = a.data as SpotMistakeAnswer;
      if (wrongLineIndex >= lines.length) {
        errors.push(`answer.wrongLineIndex (${wrongLineIndex}) is out of range for ${lines.length} lines`);
      }
      break;
    }
  }
  return errors;
}

function isPermutation(values: number[], length: number): boolean {
  const seen = new Set(values);
  if (seen.size !== length) return false;
  for (let i = 0; i < length; i++) {
    if (!seen.has(i)) return false;
  }
  return true;
}

// Pre-filled skeletons the admin content editor's payload/answer JSON
// textareas open with for a newly-created question of each format - every
// LocalizedText leaf starts empty (still valid Zod-wise; only the publish
// gate requires them filled), and bounds are already internally consistent
// so a brand-new draft never immediately fails validateAnswerBounds.
export const QUESTION_PAYLOAD_TEMPLATES: Record<QuestionFormat, unknown> = {
  single_select: {
    options: [
      { en: "", hi: "", hx: "" },
      { en: "", hi: "", hx: "" },
    ],
  } satisfies SingleSelectPayload,
  ordering: {
    pool: [
      { en: "", hi: "", hx: "" },
      { en: "", hi: "", hx: "" },
    ],
  } satisfies OrderingPayload,
  sort_buckets: {
    items: [
      { en: "", hi: "", hx: "" },
      { en: "", hi: "", hx: "" },
    ],
    buckets: [
      { en: "", hi: "", hx: "" },
      { en: "", hi: "", hx: "" },
    ],
  } satisfies SortBucketsPayload,
  fill_blank: {
    sentenceParts: [
      { en: "", hi: "", hx: "" },
      { en: "", hi: "", hx: "" },
    ],
    pool: [{ en: "", hi: "", hx: "" }],
  } satisfies FillBlankPayload,
  match_pairs: {
    left: [
      { en: "", hi: "", hx: "" },
      { en: "", hi: "", hx: "" },
    ],
    right: [
      { en: "", hi: "", hx: "" },
      { en: "", hi: "", hx: "" },
    ],
  } satisfies MatchPairsPayload,
  spot_mistake: {
    lines: [
      { en: "", hi: "", hx: "" },
      { en: "", hi: "", hx: "" },
    ],
  } satisfies SpotMistakePayload,
};

export const QUESTION_ANSWER_TEMPLATES: Record<QuestionFormat, unknown> = {
  single_select: { correctIndex: 0 } satisfies SingleSelectAnswer,
  ordering: { correctOrder: [0, 1] } satisfies OrderingAnswer,
  sort_buckets: { bucketByItemIndex: [0, 1] } satisfies SortBucketsAnswer,
  fill_blank: { correctFillIndices: [0] } satisfies FillBlankAnswer,
  match_pairs: { rightIndexByLeftIndex: [0, 1] } satisfies MatchPairsAnswer,
  spot_mistake: { wrongLineIndex: 0 } satisfies SpotMistakeAnswer,
};

// --- Staff (admin) - plain Zod, not OpenAPI-registered (admin mutations
// are Server Actions per docs/ARCHITECTURE.md D16). No app-facing schema is
// registered here - Checkpoint 5a has no GET endpoint for questions (there
// is nothing useful an app can do with a question's payload before
// Checkpoint 5b's answer-submission exists to grade it), so a public,
// answer-free projection schema is introduced in 5b, not speculatively here. ---

export const CreateQuestionDraftSchema = z
  .object({
    format: QuestionFormatSchema,
    topic: z.string().min(1).nullable(),
    prompt: LocalizedTextSchema,
    explanation: LocalizedTextSchema,
    payload: z.record(z.string(), z.unknown()),
    answer: z.unknown(),
  })
  .superRefine((val, ctx) => {
    const payloadResult = payloadSchemaForFormat(val.format).safeParse(val.payload);
    if (!payloadResult.success) {
      for (const issue of payloadResult.error.issues) {
        ctx.addIssue({ ...issue, path: ["payload", ...issue.path] });
      }
      return; // bounds checking needs a structurally valid payload first
    }
    const answerResult = answerSchemaForFormat(val.format).safeParse(val.answer);
    if (!answerResult.success) {
      for (const issue of answerResult.error.issues) {
        ctx.addIssue({ ...issue, path: ["answer", ...issue.path] });
      }
      return;
    }
    for (const message of validateAnswerBounds(val.format, val.payload, val.answer)) {
      ctx.addIssue({ code: "custom", message, path: [] });
    }
  });
export type CreateQuestionDraftInput = z.infer<typeof CreateQuestionDraftSchema>;

// No `format` field - format is immutable after creation (payload/answer
// shape depends on it), same reasoning as lessons' UpdateLessonDraftSchema.
// The service layer fetches the existing question's format and validates
// payload/answer against it there.
export const UpdateQuestionDraftSchema = z.object({
  id: z.string().uuid(),
  topic: z.string().min(1).nullable(),
  prompt: LocalizedTextSchema,
  explanation: LocalizedTextSchema,
  payload: z.record(z.string(), z.unknown()),
  answer: z.unknown(),
});
export type UpdateQuestionDraftInput = z.infer<typeof UpdateQuestionDraftSchema>;

export const QuestionIdSchema = z.object({ id: z.string().uuid() });
export type QuestionIdInput = z.infer<typeof QuestionIdSchema>;

// D20 (docs/ARCHITECTURE.md): direct edit of an already-PUBLISHED question's
// prompt/explanation/payload/answer, without unpublishing - the fix for the
// circular problem where unpublishing a question is blocked while a
// published lesson references it (src/server/questions/service.ts
// unpublishQuestion). No `topic`/`format` - format is immutable (as with
// UpdateQuestionDraftSchema) and topic isn't part of what a hotfix is for.
export const HotfixQuestionSchema = z.object({
  id: z.string().uuid(),
  prompt: LocalizedTextSchema,
  explanation: LocalizedTextSchema,
  payload: z.record(z.string(), z.unknown()),
  answer: z.unknown(),
});
export type HotfixQuestionInput = z.infer<typeof HotfixQuestionSchema>;
