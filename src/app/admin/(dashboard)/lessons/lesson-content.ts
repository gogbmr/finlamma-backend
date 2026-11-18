// Pure, framework-free lesson-content logic for the Task 4 editor redesign
// (lesson-editor.tsx) - deliberately kept in its own module with NO React/
// next/server-action imports, so it can be unit-tested directly
// (content-round-trip.test.ts) without pulling in ./actions's "use server"
// chain, which throws on import outside a real request (missing env vars
// like DATABASE_URL via src/db/client.ts).
import { z } from "zod";
import { LocalizedTextSchema } from "@/server/shared/schemas";
import {
  contentSchemaForKind,
  QuizLikeContentSchema,
  type LessonKindCreate,
} from "@/server/lessons/schemas";

// Every kind a lesson can be created/edited as.
export const CREATABLE_KINDS = [
  "video",
  "story",
  "quiz",
  "boss_quiz",
  "role_play",
  "doubt_zone",
] as const;
export type CreatableKind = (typeof CREATABLE_KINDS)[number];

// ---------------------------------------------------------------------------
// Task 4: client-side form schema, composed ONLY from the pieces
// src/server/lessons/schemas.ts already exports - never a change to that
// file. chapter/step bounds and LocalizedTextSchema reuse the exact shapes
// the server validates against; content is picked per-kind the same way
// the server's contentSchemaForKind does. This is a BLOCKING-structure
// schema only (type/shape, matching what the server already rejects at
// draft-save time) - the separate, non-blocking "soft" warnings (empty
// hi/hx, non-https url, timer-beyond-length, empty scenes) live in
// lesson-editor.tsx's computeLessonWarnings, deliberately NOT encoded
// here, since a zodResolver error blocks handleSubmit entirely and draft
// save must stay possible with those present.
// ---------------------------------------------------------------------------

const BasicsSchema = z.object({
  chapter: z.number().int().min(1).max(8),
  step: z.number().int().min(1).max(5),
});
const TextSchema = z.object({ title: LocalizedTextSchema, blurb: LocalizedTextSchema });

// questionIds is `{ value: string }[]` in LIVE form state, never a plain
// string[] - useFieldArray requires an array of objects, not primitives
// (see contentToFormValues/formValuesToContent below), so the schema that
// actually validates the form must expect that wrapped shape too. Reusing
// QuizLikeContentSchema as-is here would make the resolver reject
// `questionIds` on every single quiz/boss_quiz/role_play submit, since the
// live values would never match its plain `z.string().uuid()[]`.
const QuizLikeFormContentSchema = QuizLikeContentSchema.extend({
  questionIds: z.array(z.object({ value: z.string().uuid() })).min(1),
});

function formContentSchemaForKind(kind: LessonKindCreate) {
  if (kind === "quiz" || kind === "boss_quiz" || kind === "role_play") {
    return QuizLikeFormContentSchema;
  }
  return contentSchemaForKind(kind);
}

export function buildLessonFormSchema(kind: LessonKindCreate) {
  return BasicsSchema.merge(TextSchema).extend({ content: formContentSchemaForKind(kind) });
}

// ---------------------------------------------------------------------------
// content <-> form-values transforms: only questionIds needs wrapping
// (useFieldArray requires an array of objects, never primitives) - every
// other kind's arrays are already objects.
// ---------------------------------------------------------------------------

export function contentToFormValues(kind: string, content: unknown): Record<string, unknown> {
  const base = (content as Record<string, unknown>) ?? {};
  if (kind === "quiz" || kind === "boss_quiz" || kind === "role_play") {
    const questionIds = Array.isArray(base.questionIds) ? (base.questionIds as string[]) : [];
    return { ...base, questionIds: questionIds.map((value) => ({ value })) };
  }
  return base;
}

export function formValuesToContent(
  kind: string,
  values: Record<string, unknown>,
): Record<string, unknown> {
  if (kind === "quiz" || kind === "boss_quiz" || kind === "role_play") {
    const wrapped = Array.isArray(values.questionIds) ? (values.questionIds as { value: string }[]) : [];
    return { ...values, questionIds: wrapped.map((w) => w.value) };
  }
  return values;
}

// Data-loss guard: zodResolver's successful result is the PARSED output of
// a plain z.object() content schema, which silently strips any key the
// schema doesn't declare (Zod's default "strip unknown keys" behavior,
// since none of src/server/lessons/schemas.ts's content schemas use
// .passthrough()). The server's own mutation paths never do this
// stripping themselves - updateLessonDraft/hotfixLesson
// (src/server/lessons/service.ts) only safeParse content to VALIDATE its
// shape, then persist the caller's original `input.content` verbatim - so
// a field this form doesn't know about (from a schema this form predates,
// or authored through some other path) would otherwise survive in the DB
// until this editor loads and re-saves it, silently dropping it then.
// Fix: snapshot whatever's in a loaded lesson's content that ISN'T one of
// this kind's known keys, and merge it back onto every save - never
// editable through the form, but never discarded either.
const KNOWN_CONTENT_KEYS: Record<CreatableKind, string[]> = {
  video: ["lengthSeconds", "scenes", "cues", "video"],
  story: ["lengthSeconds", "pages"],
  quiz: ["questionIds", "framing"],
  boss_quiz: ["questionIds", "framing"],
  role_play: ["questionIds", "framing"],
  doubt_zone: ["mentorKey", "educationalOnlyNote", "chips"],
};

export function extractUnknownContentKeys(kind: string, content: unknown): Record<string, unknown> {
  if (typeof content !== "object" || content === null) return {};
  const known = new Set(KNOWN_CONTENT_KEYS[kind as CreatableKind] ?? []);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(content as Record<string, unknown>)) {
    if (!known.has(key)) result[key] = value;
  }
  return result;
}
