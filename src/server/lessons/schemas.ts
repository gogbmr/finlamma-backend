import { z } from "zod";
import { registry } from "@/lib/openapi";
import { LocalizedTextSchema } from "@/server/shared/schemas";

// All 6 kinds are creatable as of Checkpoint 4b (doubt_zone joined
// video/story/quiz/boss_quiz/role_play from 4a). The DB enum
// (src/db/schema/lessons.ts) already had doubt_zone from the start, so no
// migration was needed when this list grew.
export const LessonKindCreateSchema = z.enum([
  "video",
  "story",
  "quiz",
  "boss_quiz",
  "role_play",
  "doubt_zone",
]);
export type LessonKindCreate = z.infer<typeof LessonKindCreateSchema>;

// Same 6 values as LessonKindCreateSchema today, kept as a separate schema
// since it represents a different thing (every kind a lesson can ever have,
// for reading) that could diverge from what's creatable again later (e.g. a
// future system-generated kind).
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

// Doubt Zone, Checkpoint 4b - scripted in v1 (PRODUCT_SPEC.md §1): a fixed
// Q&A written by the content team, no live AI call. Learners pick from
// `chips` only - there is deliberately no free-text field anywhere in this
// shape, which is what actually enforces "no free-text input in this
// phase", not a flag that could be toggled wrong. `mentorKey` records which
// mentor persona the script was written in the voice of, fixed at
// authoring time (see docs/ARCHITECTURE.md D19 for what happens if the
// world's mentor changes later - a computed editor warning, not a
// migration). Swappable for Phase 7: the node stays `kind: "doubt_zone"`
// with this same content shape (chips keep working as suggested-question
// shortcuts even with a live model behind them); only the *runtime
// resolver* changes from "look up chip.reply" to "call the AI mentor",
// which is Phase 7's concern, not this schema's.
// chipLabel/reply/educationalOnlyNote are plain LocalizedTextSchema (no
// .openapi() call directly on it) - matching every other content schema in
// this file (SceneSchema's title/caption/mascotLine, etc.). Calling
// .openapi() directly on the LocalizedTextSchema instance imported from
// @/server/shared/schemas fails at module-load time in some import orders
// (extendZodWithOpenApi patches the Zod prototype when @/lib/openapi is
// first evaluated, and that hadn't happened yet for this instance in at
// least one real test run) - so, like the rest of this file, the
// description lives in a comment instead.
const DoubtZoneChipSchema = z.object({
  chipLabel: LocalizedTextSchema, // the suggested-question chip's own text
  reply: LocalizedTextSchema, // the canned reply shown when this chip is tapped
});

export const DoubtZoneContentSchema = z.object({
  mentorKey: z.string().min(1).openapi({
    description: "The mentor persona (see GET /api/v1/mentors) this script was written in the voice of.",
  }),
  // Shown with every reply: this is educational content, never investment
  // advice - non-negotiable rule 11.
  educationalOnlyNote: LocalizedTextSchema,
  chips: z.array(DoubtZoneChipSchema).min(1),
});
export type DoubtZoneContent = z.infer<typeof DoubtZoneContentSchema>;

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
    case "doubt_zone":
      return DoubtZoneContentSchema;
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
  doubt_zone: {
    mentorKey: "",
    educationalOnlyNote: { en: "", hi: "", hx: "" },
    chips: [{ chipLabel: { en: "", hi: "", hx: "" }, reply: { en: "", hi: "", hx: "" } }],
  } satisfies DoubtZoneContent,
};

// --- App-facing (registered in OpenAPI) ---

const LessonContentSchema = z.union([
  VideoContentSchema,
  StoryContentSchema,
  QuizLikeContentSchema,
  DoubtZoneContentSchema,
]);

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

// D20/D23 (docs/ARCHITECTURE.md): direct edit of an already-PUBLISHED
// lesson's title/blurb/content, without unpublishing - the fix for a
// boss_quiz lesson specifically, which can no longer be unpublished at all
// (D23), and a lower-disruption option for any other lesson (unpublishing
// still works for those, but briefly 404s any learner mid-lesson - see the
// unpublish-warning in src/server/lessons/service.ts). No `worldId`/
// `chapter`/`step`/`kind` - those stay structural, draft-only fields, same
// as every other domain's hotfix. `content`'s shape is still validated
// against the lesson's own (immutable) `kind`.
export const HotfixLessonSchema = z.object({
  id: z.string().uuid(),
  title: LocalizedTextSchema,
  blurb: LocalizedTextSchema,
  content: z.record(z.string(), z.unknown()),
});
export type HotfixLessonInput = z.infer<typeof HotfixLessonSchema>;
