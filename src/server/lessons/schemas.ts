import { z } from "zod";
import { registry } from "@/lib/openapi";
import { LocalizedTextSchema } from "@/server/shared/schemas";

// 4a ships video/story/quiz/boss_quiz/role_play. doubt_zone is scripted
// content that ships in Checkpoint 4b (mentor-persona Q&A, Phase-7-
// swappable) - deliberately excluded from what can be *created* here so 4a
// never has to half-support a content shape 4b hasn't designed yet. The DB
// enum (src/db/schema/lessons.ts) already includes doubt_zone so no
// migration is needed when 4b adds it.
export const LessonKindCreateSchema = z.enum([
  "video",
  "story",
  "quiz",
  "boss_quiz",
  "role_play",
]);
export type LessonKindCreate = z.infer<typeof LessonKindCreateSchema>;

// All 6, for reading back a lesson of any kind (including a future
// doubt_zone one once 4b ships).
export const LessonKindSchema = z.enum([
  "video",
  "story",
  "quiz",
  "boss_quiz",
  "role_play",
  "doubt_zone",
]);
export type LessonKind = z.infer<typeof LessonKindSchema>;

// --- Content shapes, one per kind. Boss Quiz and Role Play reuse the same
// shape as Quiz (PRODUCT_SPEC.md §1: both render through the same
// lesson-flow engine as a normal Quiz step, just with different settings/
// framing) - see docs/DATA_MODEL.md and D18: `questionId`/`questionIds`
// reference the `questions` table (Checkpoint 5), validated for UUID shape
// only until then. ---

const SceneSchema = z.object({
  at: z.number().nonnegative().openapi({ description: "Seconds into the video this scene starts." }),
  kind: z.string().min(1).openapi({
    description: "Open, admin-extensible enum (e.g. \"trade\", \"coins\", \"timeline\").",
  }),
  title: LocalizedTextSchema,
  caption: LocalizedTextSchema,
  mascotLine: LocalizedTextSchema,
});

const VideoCueSchema = z.object({
  at: z.number().nonnegative().openapi({ description: "Seconds into the video this pop-quiz fires." }),
  questionId: z.string().uuid(),
  timerSeconds: z.number().int().positive(),
});

export const VideoContentSchema = z.object({
  lengthSeconds: z.number().positive(),
  scenes: z.array(SceneSchema).default([]),
  cues: z.array(VideoCueSchema).default([]),
});
export type VideoContent = z.infer<typeof VideoContentSchema>;

const StoryPageSchema = z.object({ text: LocalizedTextSchema });
export const StoryContentSchema = z.object({
  lengthSeconds: z.number().positive(),
  pages: z.array(StoryPageSchema).min(1),
});
export type StoryContent = z.infer<typeof StoryContentSchema>;

export const QuizLikeContentSchema = z.object({
  questionIds: z.array(z.string().uuid()).min(1),
  framing: LocalizedTextSchema.optional().openapi({
    description: "Role Play's dialogue/receipt-graphic framing text, if this step uses it.",
  }),
});
export type QuizLikeContent = z.infer<typeof QuizLikeContentSchema>;

export function contentSchemaForKind(kind: LessonKindCreate) {
  switch (kind) {
    case "video":
      return VideoContentSchema;
    case "story":
      return StoryContentSchema;
    case "quiz":
    case "boss_quiz":
    case "role_play":
      return QuizLikeContentSchema;
  }
}

// Pre-filled skeleton the admin content editor's JSON textarea opens with
// for a newly-created lesson of each kind - every LocalizedText leaf starts
// empty (still valid Zod-wise; only the publish gate requires them filled).
export const LESSON_CONTENT_TEMPLATES: Record<LessonKindCreate, unknown> = {
  video: {
    lengthSeconds: 48,
    scenes: [
      {
        at: 5,
        kind: "trade",
        title: { en: "", hi: "", hx: "" },
        caption: { en: "", hi: "", hx: "" },
        mascotLine: { en: "", hi: "", hx: "" },
      },
    ],
    cues: [],
  } satisfies VideoContent,
  story: {
    lengthSeconds: 360,
    pages: [{ text: { en: "", hi: "", hx: "" } }],
  } satisfies StoryContent,
  quiz: { questionIds: [] } satisfies QuizLikeContent,
  boss_quiz: { questionIds: [] } satisfies QuizLikeContent,
  role_play: {
    questionIds: [],
    framing: { en: "", hi: "", hx: "" },
  } satisfies QuizLikeContent,
};

// --- App-facing (registered in OpenAPI) ---

const LessonContentSchema = z.union([VideoContentSchema, StoryContentSchema, QuizLikeContentSchema]);

export const LessonSummarySchema = registry.register(
  "LessonSummary",
  z.object({
    id: z.string().uuid(),
    chapter: z.number().int().openapi({ example: 1 }),
    step: z.number().int().openapi({ example: 1 }),
    kind: LessonKindSchema,
    title: LocalizedTextSchema,
    blurb: LocalizedTextSchema,
  }),
);

export const LessonDetailSchema = registry.register(
  "LessonDetail",
  z.object({
    id: z.string().uuid(),
    worldId: z.string().uuid(),
    chapter: z.number().int().openapi({ example: 1 }),
    step: z.number().int().openapi({ example: 1 }),
    kind: LessonKindSchema,
    title: LocalizedTextSchema,
    blurb: LocalizedTextSchema,
    content: LessonContentSchema,
  }),
);

export const LessonDetailResponseSchema = registry.register(
  "LessonDetailResponse",
  z.object({ data: LessonDetailSchema }),
);
export const LessonSummaryListResponseSchema = registry.register(
  "LessonSummaryListResponse",
  z.object({ data: z.array(LessonSummarySchema) }),
);

// --- Staff (admin) - plain Zod, not OpenAPI-registered (admin mutations are
// Server Actions per docs/ARCHITECTURE.md D16, same convention as
// src/server/worlds/schemas.ts) ---

const BaseLessonFields = z.object({
  worldId: z.string().uuid(),
  chapter: z.number().int().min(1).max(8),
  step: z.number().int().min(1).max(5),
  title: LocalizedTextSchema,
  blurb: LocalizedTextSchema,
});

// kind is fixed at creation (content shape depends on it) and never
// editable afterward - see UpdateLessonDraftSchema below, which has no
// `kind` field at all. content is validated against the matching kind's
// schema right here, in one parse, so a structurally-invalid draft is
// rejected before it's even saved (translation completeness is a separate,
// publish-time-only gate - see src/server/lessons/service.ts).
export const CreateLessonDraftSchema = BaseLessonFields.extend({
  kind: LessonKindCreateSchema,
  content: z.record(z.string(), z.unknown()),
}).superRefine((val, ctx) => {
  const result = contentSchemaForKind(val.kind).safeParse(val.content);
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({ ...issue, path: ["content", ...issue.path] });
    }
  }
});
export type CreateLessonDraftInput = z.infer<typeof CreateLessonDraftSchema>;

// No `kind` field - kind is immutable after creation, so there's nothing to
// validate `content`'s shape against without a DB read first. The service
// layer fetches the existing lesson's kind and validates content there.
export const UpdateLessonDraftSchema = BaseLessonFields.extend({
  id: z.string().uuid(),
  content: z.record(z.string(), z.unknown()),
});
export type UpdateLessonDraftInput = z.infer<typeof UpdateLessonDraftSchema>;

export const LessonIdSchema = z.object({ id: z.string().uuid() });
export type LessonIdInput = z.infer<typeof LessonIdSchema>;
