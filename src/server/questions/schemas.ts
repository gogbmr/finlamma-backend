import { z } from "zod";
// Side-effect import: registers Zod's .openapi() extension method, used
// below (question-shapes branch: these per-format schemas are now composed
// into app-facing OpenAPI-registered responses in
// src/server/quiz-attempts/schemas.ts, so they need real examples). Must be
// imported before any .openapi() call in this file runs - see
// src/lib/openapi.ts.
import "@/lib/openapi";
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
  "number_guess",
]);
export type QuestionFormat = z.infer<typeof QuestionFormatSchema>;

// App asks batch, section B: the ONE shared config constant naming every
// format the app can actually render interactively today - widening it
// later (once the app ships a UI component for another format) is a
// one-line change here. Used by both admin publish gates that must refuse
// a question in an unsupported format: publishQuestion (questions/
// service.ts, the root gate - every question, lesson-embedded or
// Pulse-Check-eligible, goes through it) and
// updateNewsQuizGeneratorSettings (news/service.ts's enabledFormats
// toggle). Every format above still exists as a real, gradeable backend
// format (scoring, validation, DB schema) - this constant is purely about
// the APP's current rendering capability, not what the backend supports.
export const APP_RENDERABLE_QUESTION_FORMATS: readonly QuestionFormat[] = ["single_select"];

export function isFormatAppRenderable(format: string): boolean {
  return (APP_RENDERABLE_QUESTION_FORMATS as readonly string[]).includes(format);
}

// --- single_select: pick one of N options (covers MCQ, "options", and a
// tile-grid-style pick-the-odd-one-out, per FEATURE_MAP LF-08/09/16 - all
// three are structurally "a set of choices + one correct index"). ---
export const SingleSelectPayloadSchema = z.object({
  options: z.array(LocalizedTextSchema).min(2).openapi({
    description: "The choices to render, in order. The correct one (never sent here - see POST .../answer) is an index into this array.",
    example: [
      { en: "Spend everything as soon as it arrives", hi: "जैसे ही पैसा आए, पूरा खर्च कर दें", hx: "Jaise hi paisa aaye, pura kharch kar do" },
      { en: "Set aside a fixed % of income every month", hi: "हर महीने आय का एक तय % अलग रखें", hx: "Har mahine income ka ek fix % alag rakho" },
      { en: "Borrow money to buy stocks", hi: "स्टॉक खरीदने के लिए पैसे उधार लें", hx: "Stock kharidne ke liye paise udhaar lo" },
      { en: "Never check your bank balance", hi: "कभी भी बैंक बैलेंस न देखें", hx: "Kabhi bhi bank balance na dekho" },
    ],
  }),
});
export const SingleSelectAnswerSchema = z.object({
  correctIndex: z.number().int().nonnegative().openapi({
    description: "0-based index into payload.options.",
    example: 1,
  }),
});
export type SingleSelectPayload = z.infer<typeof SingleSelectPayloadSchema>;
export type SingleSelectAnswer = z.infer<typeof SingleSelectAnswerSchema>;

// --- ordering: arrange a word/item pool into the correct sequence
// (FEATURE_MAP LF-10/LF-18). ---
export const OrderingPayloadSchema = z.object({
  pool: z.array(LocalizedTextSchema).min(2).openapi({
    description: "The items to arrange, shown in this (scrambled) order - the correct sequence is a permutation of these indices (see answer.correctOrder).",
    example: [
      { en: "Save or invest what's left over", hi: "जो बचे उसे बचाएं या निवेश करें", hx: "Jo bache use save ya invest karo" },
      { en: "List your monthly income", hi: "अपनी मासिक आय सूचीबद्ध करें", hx: "Apni monthly income list karo" },
      { en: "Subtract expenses from income", hi: "आय से खर्च घटाएं", hx: "Income se expenses minus karo" },
      { en: "List your monthly expenses", hi: "अपने मासिक खर्च सूचीबद्ध करें", hx: "Apne monthly expenses list karo" },
    ],
  }),
});
export const OrderingAnswerSchema = z.object({
  correctOrder: z.array(z.number().int().nonnegative()).min(2).openapi({
    description: "payload.pool indices in the correct order - a permutation using every index exactly once.",
    example: [1, 3, 2, 0],
  }),
});
export type OrderingPayload = z.infer<typeof OrderingPayloadSchema>;
export type OrderingAnswer = z.infer<typeof OrderingAnswerSchema>;

// --- sort_buckets: tap items into one of exactly 2 labeled buckets
// (FEATURE_MAP LF-17, "2 labeled buckets"). ---
export const SortBucketsPayloadSchema = z.object({
  items: z.array(LocalizedTextSchema).min(2).openapi({
    description: "The items to sort - each one belongs in exactly one of payload.buckets (see answer.bucketByItemIndex).",
    example: [
      { en: "Rent", hi: "किराया", hx: "Kiraya" },
      { en: "Stock dividends", hi: "स्टॉक डिविडेंड", hx: "Stock dividend" },
      { en: "Electricity bill", hi: "बिजली का बिल", hx: "Bijli ka bill" },
      { en: "Freelance income", hi: "फ्रीलांस आय", hx: "Freelance income" },
    ],
  }),
  buckets: z.tuple([LocalizedTextSchema, LocalizedTextSchema]).openapi({
    description: "Exactly 2 bucket labels - bucket 0 and bucket 1, in this order.",
    example: [
      { en: "Expense", hi: "खर्च", hx: "Kharch" },
      { en: "Income", hi: "आय", hx: "Income" },
    ],
  }),
});
export const SortBucketsAnswerSchema = z.object({
  bucketByItemIndex: z.array(z.union([z.literal(0), z.literal(1)])).min(2).openapi({
    description: "One entry per payload.items entry (same order), each 0 or 1 - which payload.buckets slot that item belongs in.",
    example: [0, 1, 0, 1],
  }),
});
export type SortBucketsPayload = z.infer<typeof SortBucketsPayloadSchema>;
export type SortBucketsAnswer = z.infer<typeof SortBucketsAnswerSchema>;

// --- fill_blank: sentence parts around blanks + a word pool
// (FEATURE_MAP LF-19). N sentence parts frame N-1 blanks, one fill each. ---
export const FillBlankPayloadSchema = z.object({
  sentenceParts: z.array(LocalizedTextSchema).min(2).openapi({
    description: "N parts of the sentence; a blank sits between every consecutive pair (N-1 blanks total). Render part[0], blank, part[1], blank, ... part[N-1].",
    example: [
      { en: "A ", hi: "एक ", hx: "Ek " },
      { en: " is money set aside for emergencies.", hi: " आपातकाल के लिए अलग रखा गया पैसा है।", hx: " emergency ke liye alag rakha paisa hai." },
    ],
  }),
  pool: z.array(LocalizedTextSchema).min(1).openapi({
    description: "Word/phrase pool the learner picks from to fill each blank - each entry can be reused, picked once, or left unused depending on the question.",
    example: [
      { en: "budget", hi: "बजट", hx: "budget" },
      { en: "emergency fund", hi: "इमरजेंसी फंड", hx: "emergency fund" },
      { en: "loan", hi: "कर्ज़", hx: "loan" },
    ],
  }),
});
export const FillBlankAnswerSchema = z.object({
  correctFillIndices: z.array(z.number().int().nonnegative()).min(1).openapi({
    description: "One payload.pool index per blank, in blank order (length = sentenceParts.length - 1).",
    example: [1],
  }),
});
export type FillBlankPayload = z.infer<typeof FillBlankPayloadSchema>;
export type FillBlankAnswer = z.infer<typeof FillBlankAnswerSchema>;

// --- match_pairs: tap-tap pairing between two equal-length columns
// (FEATURE_MAP LF-20). ---
export const MatchPairsPayloadSchema = z.object({
  left: z.array(LocalizedTextSchema).min(2).openapi({
    description: "The left column - each entry pairs with exactly one payload.right entry (see answer.rightIndexByLeftIndex).",
    example: [
      { en: "SIP", hi: "एसआईपी", hx: "SIP" },
      { en: "NAV", hi: "एनएवी", hx: "NAV" },
      { en: "Diversification", hi: "विविधीकरण", hx: "Diversification" },
    ],
  }),
  right: z.array(LocalizedTextSchema).min(2).openapi({
    description: "The right column, same length as payload.left, shown in a shuffled order.",
    example: [
      { en: "A fixed monthly investment plan", hi: "एक तय मासिक निवेश योजना", hx: "Ek fix monthly investment plan" },
      { en: "The per-unit value of a mutual fund", hi: "म्यूचुअल फंड की प्रति-यूनिट कीमत", hx: "Mutual fund ki per-unit value" },
      { en: "Spreading investments across asset types", hi: "निवेश को विभिन्न एसेट में फैलाना", hx: "Investment ko alag-alag asset types mein spread karna" },
    ],
  }),
});
export const MatchPairsAnswerSchema = z.object({
  rightIndexByLeftIndex: z.array(z.number().int().nonnegative()).min(2).openapi({
    description: "One payload.right index per payload.left entry (same order) - which right-column entry that left entry pairs with.",
    example: [2, 1, 0],
  }),
});
export type MatchPairsPayload = z.infer<typeof MatchPairsPayloadSchema>;
export type MatchPairsAnswer = z.infer<typeof MatchPairsAnswerSchema>;

// --- spot_mistake: tap the one wrong line among several (FEATURE_MAP LF-21). ---
export const SpotMistakePayloadSchema = z.object({
  lines: z.array(LocalizedTextSchema).min(2).openapi({
    description: "The lines to inspect - exactly one is factually wrong (see answer.wrongLineIndex).",
    example: [
      { en: "Track your expenses every month.", hi: "हर महीने अपने खर्च पर नज़र रखें।", hx: "Har mahine apne expenses track karo." },
      { en: "Spend more than you earn to grow faster.", hi: "तेज़ी से बढ़ने के लिए कमाई से ज़्यादा खर्च करें।", hx: "Jaldi grow karne ke liye kamai se zyada kharch karo." },
      { en: "Save at least 20% of your income.", hi: "अपनी आय का कम से कम 20% बचाएं।", hx: "Apni income ka kam se kam 20% save karo." },
      { en: "Review your budget every quarter.", hi: "हर तीन महीने में अपना बजट जांचें।", hx: "Har teen mahine mein apna budget check karo." },
    ],
  }),
});
export const SpotMistakeAnswerSchema = z.object({
  wrongLineIndex: z.number().int().nonnegative().openapi({
    description: "0-based index into payload.lines of the one wrong line.",
    example: 1,
  }),
});
export type SpotMistakePayload = z.infer<typeof SpotMistakePayloadSchema>;
export type SpotMistakeAnswer = z.infer<typeof SpotMistakeAnswerSchema>;

// --- number_guess: drag a slider to guess a number within a tolerance band
// (Pulse Check's "Number Pakdo" - FEATURE_MAP NW-17). The one Pulse Check
// format with no existing equivalent; every other prototype format reuses
// single_select/ordering/sort_buckets/fill_blank/match_pairs/spot_mistake. ---
export const NumberGuessPayloadSchema = z.object({
  unit: LocalizedTextSchema.openapi({
    description: "Shown next to the slider, e.g. a metric name/unit.",
    example: { en: "Repo rate (%)", hi: "रेपो रेट (%)", hx: "Repo rate (%)" },
  }), // e.g. "PERCENT · CPI" - shown next to the slider
  min: z.number().openapi({ description: "Slider's minimum selectable value.", example: 0 }),
  max: z.number().openapi({ description: "Slider's maximum selectable value.", example: 15 }),
  step: z.number().positive().openapi({ description: "Slider's increment.", example: 0.25 }),
});
export const NumberGuessAnswerSchema = z.object({
  correctValue: z.number().openapi({ description: "The correct value on the [payload.min, payload.max] scale.", example: 6.5 }),
  tolerance: z.number().nonnegative().openapi({
    description: "An answer within [correctValue - tolerance, correctValue + tolerance] counts as correct.",
    example: 0.5,
  }),
});
export type NumberGuessPayload = z.infer<typeof NumberGuessPayloadSchema>;
export type NumberGuessAnswer = z.infer<typeof NumberGuessAnswerSchema>;

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
    case "number_guess":
      return NumberGuessPayloadSchema;
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
    case "number_guess":
      return NumberGuessAnswerSchema;
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
    case "number_guess": {
      const { min, max } = p.data as NumberGuessPayload;
      const { correctValue, tolerance } = a.data as NumberGuessAnswer;
      if (max <= min) {
        errors.push(`payload.max (${max}) must be greater than payload.min (${min})`);
      }
      if (correctValue < min || correctValue > max) {
        errors.push(`answer.correctValue (${correctValue}) is out of range [${min}, ${max}]`);
      }
      if (tolerance > max - min) {
        errors.push(`answer.tolerance (${tolerance}) is wider than the payload's own range [${min}, ${max}]`);
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
  number_guess: {
    unit: { en: "", hi: "", hx: "" },
    min: 0,
    max: 10,
    step: 1,
  } satisfies NumberGuessPayload,
};

export const QUESTION_ANSWER_TEMPLATES: Record<QuestionFormat, unknown> = {
  single_select: { correctIndex: 0 } satisfies SingleSelectAnswer,
  ordering: { correctOrder: [0, 1] } satisfies OrderingAnswer,
  sort_buckets: { bucketByItemIndex: [0, 1] } satisfies SortBucketsAnswer,
  fill_blank: { correctFillIndices: [0] } satisfies FillBlankAnswer,
  match_pairs: { rightIndexByLeftIndex: [0, 1] } satisfies MatchPairsAnswer,
  spot_mistake: { wrongLineIndex: 0 } satisfies SpotMistakeAnswer,
  number_guess: { correctValue: 5, tolerance: 1 } satisfies NumberGuessAnswer,
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
    topicId: z.string().uuid().nullable(),
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
  topicId: z.string().uuid().nullable(),
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
