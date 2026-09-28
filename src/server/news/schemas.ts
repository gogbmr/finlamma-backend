import { z } from "zod";
// Side-effect import: registers Zod's .openapi() extension method, used
// below. Must be imported before any .openapi() call in this file runs -
// see src/lib/openapi.ts.
import "@/lib/openapi";
import { LocalizedTextSchema } from "@/server/shared/schemas";

const StoryPreviewSchema = z.object({
  id: z.uuid(),
  headline: LocalizedTextSchema,
  summary: LocalizedTextSchema,
  category: z.string().openapi({ example: "rbi_rates" }),
  impact: z.enum(["good", "bad", "neutral"]),
  outlet: z.string().openapi({ example: "mock" }),
  featured: z.boolean(),
  publishedAt: z.string().datetime(),
  read: z.boolean().openapi({ description: "Whether the caller has already read this story" }),
}).openapi("NewsStoryPreview");

export const NewsFeedResponseSchema = z.object({
  data: z.array(StoryPreviewSchema),
  nextCursor: z.string().nullable(),
});

export const NewsStoryDetailResponseSchema = z.object({
  id: z.uuid(),
  headline: LocalizedTextSchema,
  summary: LocalizedTextSchema,
  body: z.array(LocalizedTextSchema),
  jargon: z.object({ term: LocalizedTextSchema, explanation: LocalizedTextSchema }),
  category: z.string().openapi({ example: "rbi_rates" }),
  impact: z.enum(["good", "bad", "neutral"]),
  outlet: z.string().openapi({ example: "mock" }),
  sourceUrl: z.url(),
  publishedAt: z.string().datetime(),
  read: z.boolean(),
  minReadSeconds: z
    .number()
    .int()
    .openapi({ description: "The dwellSeconds the app must report to POST .../read for this to count", example: 25 }),
}).openapi("NewsStoryDetail");

export const MarkNewsReadRequestSchema = z.object({
  dwellSeconds: z
    .number()
    .int()
    .nonnegative()
    .describe("How many seconds the client measured the story being on screen")
    .openapi({ example: 30 }),
});
export type MarkNewsReadInput = z.infer<typeof MarkNewsReadRequestSchema>;

export const MarkNewsReadResponseSchema = z.object({
  read: z.boolean(),
  alreadyRead: z.boolean().openapi({ description: "true if this story was already marked read earlier" }),
});

export const NewsDeskPickSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["desk_pick", "exam_alert", "scam_watch"]),
  storyId: z.uuid().nullable(),
  content: z.object({ title: LocalizedTextSchema, body: LocalizedTextSchema }).nullable(),
  attribution: z.string().nullable(),
}).openapi("NewsDeskPick");

export const NewsDeskPicksResponseSchema = z.object({
  data: z.array(NewsDeskPickSchema),
});

export const NewsCategorySchema = z.enum([
  "rbi_rates",
  "inflation",
  "stock_market_basics",
  "ipos_new_listings",
  "mutual_funds",
  "banking",
  "scams_fraud",
  "government_budget",
  "global_markets",
  "currency",
]);
export type NewsCategory = z.infer<typeof NewsCategorySchema>;

export const NewsImpactSchema = z.enum(["good", "bad", "neutral"]);
export const NewsQualityGradeSchema = z.enum(["A", "B", "C"]);
export const NewsStoryStatusSchema = z.enum(["draft", "published", "hidden"]);

export const NewsStoryContentSchema = z.object({
  headline: LocalizedTextSchema,
  summary: LocalizedTextSchema,
  body: z.array(LocalizedTextSchema).min(1),
});
export type NewsStoryContent = z.infer<typeof NewsStoryContentSchema>;

export const NewsJargonSchema = z.object({
  term: LocalizedTextSchema,
  explanation: LocalizedTextSchema,
});
export type NewsJargon = z.infer<typeof NewsJargonSchema>;

// The shape Anthropic is asked to fill in for one raw item - see
// src/server/news/ai.ts's draftNewsStoryFromRaw. Deliberately does NOT
// include topicId (the AI has no knowledge of our topics table's UUIDs -
// topic tagging stays a staff decision, made in the News Desk pipeline
// before publish) or qualityGrade (a deterministic heuristic per
// docs/DATA_MODEL.md, computed separately in src/server/news/grading.ts -
// never an LLM judgment call about its own output's quality).
// One AI-drafted "Quick Check" MCQ (single_select, 3 options) per story -
// the simplest, most reliable Pulse Check format, per the same
// single_select-covers-MCQ design questions/schemas.ts already documents.
// Richer formats (slider, match pairs, ...) stay staff-authored via the
// existing Question editor, not AI-drafted in v1.
const NewsDraftQuestionSchema = z.object({
  prompt: LocalizedTextSchema,
  options: z.array(LocalizedTextSchema).length(3),
  correctIndex: z.number().int().min(0).max(2),
  explanation: LocalizedTextSchema,
});

export const NewsDraftAiOutputSchema = z.object({
  content: NewsStoryContentSchema,
  jargon: NewsJargonSchema,
  category: NewsCategorySchema,
  impact: NewsImpactSchema,
  question: NewsDraftQuestionSchema,
});
export type NewsDraftAiOutput = z.infer<typeof NewsDraftAiOutputSchema>;

// Admin: toggle a story's status (NW-37's instant publish/hidden toggle),
// and optionally override the auto-computed quality grade.
export const UpdateNewsStoryStatusSchema = z.object({
  id: z.string().uuid(),
  status: NewsStoryStatusSchema,
});
export type UpdateNewsStoryStatusInput = z.infer<typeof UpdateNewsStoryStatusSchema>;

export const UpdateNewsStoryQualityOverrideSchema = z.object({
  id: z.string().uuid(),
  qualityGradeOverride: NewsQualityGradeSchema.nullable(),
});
export type UpdateNewsStoryQualityOverrideInput = z.infer<typeof UpdateNewsStoryQualityOverrideSchema>;

export const UpdateNewsStoryTopicSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid().nullable(),
});
export type UpdateNewsStoryTopicInput = z.infer<typeof UpdateNewsStoryTopicSchema>;

// News Desk's quiz generator settings (NW-38..42) - settings_kv-driven, same
// pattern as lesson_flow_scoring (D21). questionCount is how many questions
// a day's news_editions.questionIds pool draws from published stories'
// questions; perQuestionTimerSeconds/baseVmByFormat feed Pulse Check's own
// scoring at Checkpoint 4, not used by drafting itself.
export const NewsQuizGeneratorSettingsSchema = z.object({
  questionCount: z.number().int().min(4).max(20),
  perQuestionTimerSeconds: z.number().int().min(10).max(35),
  baseVmPerQuestion: z.number().int().positive(),
  enabledFormats: z.array(
    z.enum([
      "single_select",
      "ordering",
      "sort_buckets",
      "fill_blank",
      "match_pairs",
      "spot_mistake",
      "number_guess",
    ]),
  ),
});
export type NewsQuizGeneratorSettings = z.infer<typeof NewsQuizGeneratorSettingsSchema>;

export const DEFAULT_NEWS_QUIZ_GENERATOR_SETTINGS: NewsQuizGeneratorSettings = {
  questionCount: 8,
  perQuestionTimerSeconds: 20,
  baseVmPerQuestion: 30,
  enabledFormats: [
    "single_select",
    "ordering",
    "sort_buckets",
    "fill_blank",
    "match_pairs",
    "spot_mistake",
    "number_guess",
  ],
};
export const NEWS_QUIZ_GENERATOR_SETTINGS_KEY = "news_quiz_generator";
