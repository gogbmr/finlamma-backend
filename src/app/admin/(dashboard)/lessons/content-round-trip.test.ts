// Data-loss guard for the Task 4 lesson-editor redesign: zodResolver's
// successful result is the schema's PARSED output, which silently strips
// any key a plain z.object() content schema doesn't declare (none of
// src/server/lessons/schemas.ts's content schemas use .passthrough()).
// This simulates the exact load -> default values -> submit path the real
// form takes, using fixtures shaped like the real dev-seed content
// (scripts/seed-dev-content.ts) for every lesson kind, and fails if any
// field present in the original is dropped, renamed, or changes value.
import { describe, expect, it } from "vitest";
import type { LocalizedText } from "@/server/shared/schemas";
import {
  buildLessonFormSchema,
  contentToFormValues,
  extractUnknownContentKeys,
  formValuesToContent,
} from "./lesson-content";

type Kind = "video" | "story" | "quiz" | "boss_quiz" | "role_play" | "doubt_zone";

function L(en: string): LocalizedText {
  return { en, hi: `hi: ${en}`, hx: `hx: ${en}` };
}

const QUESTION_A = "11111111-1111-4111-8111-111111111111";
const QUESTION_B = "22222222-2222-4222-8222-222222222222";
const QUESTION_C = "33333333-3333-4333-8333-333333333333";

// Shaped exactly like scripts/seed-dev-content.ts's real seeded rows for
// each kind (same field set) - not synthetic shapes invented for this test.
const FIXTURES: Record<Kind, Record<string, unknown>> = {
  video: {
    lengthSeconds: 48,
    scenes: [
      {
        at: 5,
        kind: "trade",
        title: L("Scene title"),
        caption: L("Scene caption"),
        mascotLine: L("Mascot line"),
      },
    ],
    cues: [{ at: 20, questionId: QUESTION_A, timerSeconds: 15 }],
  },
  story: {
    lengthSeconds: 180,
    pages: [{ text: L("Story page one text") }, { text: L("Story page two text") }],
  },
  quiz: {
    questionIds: [QUESTION_A, QUESTION_B, QUESTION_C],
  },
  boss_quiz: {
    questionIds: [QUESTION_A, QUESTION_B, QUESTION_C],
  },
  role_play: {
    questionIds: [QUESTION_A, QUESTION_B, QUESTION_C],
    framing: L("Role play framing text"),
  },
  doubt_zone: {
    mentorKey: "baby",
    educationalOnlyNote: L("This is educational content, not personal investment advice"),
    chips: [
      { chipLabel: L("Why does this matter?"), reply: L("Canned dev-seed reply") },
      { chipLabel: L("What should I do next?"), reply: L("Canned dev-seed reply") },
    ],
  },
};

const KINDS = Object.keys(FIXTURES) as Kind[];

// Mirrors exactly what LessonForm's onSaveDraft/onSaveHotfix do: load into
// RHF defaultValues, run the live zodResolver schema (the actual
// validation gate, including the questionIds-wrapping fix), unwrap back to
// the server's content shape, then re-merge any passthrough keys the form
// itself never touched.
function simulateRoundTrip(kind: Kind, original: Record<string, unknown>): Record<string, unknown> {
  const unknownKeys = extractUnknownContentKeys(kind, original);
  const formValues = contentToFormValues(kind, original);
  const parsed = buildLessonFormSchema(kind).shape.content.parse(formValues);
  return { ...unknownKeys, ...formValuesToContent(kind, parsed as Record<string, unknown>) };
}

describe("lesson content form round-trip (no data loss)", () => {
  for (const kind of KINDS) {
    it(`${kind}: every field in real seeded content survives load -> submit unchanged`, () => {
      const original = FIXTURES[kind];
      const result = simulateRoundTrip(kind, original);
      // toMatchObject, not toEqual: a resave may ADD a key the schema
      // itself defaults when absent (e.g. video.url defaults to
      // {en:null,hi:null,hx:null} if the original never had a `video` key
      // at all) - that's additive, cosmetic normalization, never a loss.
      // What must never happen is a field that WAS in the original going
      // missing, being renamed, or changing value - toMatchObject fails on
      // exactly that, regardless of any additive default.
      expect(result).toMatchObject(original);
    });
  }

  it("preserves a content key the form doesn't render an input for (future schema field, or one authored outside this editor)", () => {
    const original = { ...FIXTURES.video, experimentalCaptionStyle: "bold" };
    const result = simulateRoundTrip("video", original);
    expect(result.experimentalCaptionStyle).toBe("bold");
  });

  it("never invents an empty framing object on quiz/boss_quiz content that never had one", () => {
    for (const kind of ["quiz", "boss_quiz"] as const) {
      const result = simulateRoundTrip(kind, FIXTURES[kind]);
      expect(result).not.toHaveProperty("framing");
    }
  });

  it("role_play's real framing text survives unchanged", () => {
    const result = simulateRoundTrip("role_play", FIXTURES.role_play);
    expect(result.framing).toEqual(FIXTURES.role_play.framing);
  });
});
