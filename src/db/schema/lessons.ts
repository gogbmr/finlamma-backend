import { index, integer, jsonb, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idAndTimestamps, type LocalizedText } from "./_helpers";
import { staffMembers } from "./staff";
import { worlds } from "./worlds";

export const lessonKindEnum = pgEnum("lesson_kind", [
  "video",
  "story",
  "quiz",
  "boss_quiz",
  "role_play",
  "doubt_zone",
]);
export const lessonStatusEnum = pgEnum("lesson_status", ["draft", "published"]);

// A world is a trail of 8 chapters x 5 steps (WH-12/WH-13). Boss Quiz and
// Role Play are `kind` values, not separate tables or engines - both render
// through the same lesson-flow content shape as a Quiz step, per
// PRODUCT_SPEC.md §1. `content`'s shape depends on `kind` (see
// src/server/lessons/schemas.ts's per-kind Zod schemas) - typed loosely
// here since Drizzle's $type<>() is compile-time only and the real
// validation happens at the service layer's publish gate, not the DB.
//
// content may reference a `questions` row by id (an in-video pop-quiz cue,
// a quiz/boss_quiz/role_play question list) before that table exists -
// see docs/ARCHITECTURE.md decision D18 for the plan to close that gap in
// Checkpoint 5.
export const lessons = pgTable(
  "lessons",
  {
    ...idAndTimestamps(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "restrict" }),
    chapter: integer("chapter").notNull(),
    step: integer("step").notNull(),
    kind: lessonKindEnum("kind").notNull(),
    title: jsonb("title").$type<LocalizedText>().notNull(),
    blurb: jsonb("blurb").$type<LocalizedText>().notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    // Null = use reward_rules' default for this lesson's kind (the normal
    // case). Set only when a specific lesson should pay a different amount
    // than its kind's default (docs/DATA_MODEL.md, FEATURE_MAP WH-14).
    xpOverride: integer("xp_override"),
    vmOverride: integer("vm_override"),
    status: lessonStatusEnum("status").default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by").references(() => staffMembers.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("lessons_status_idx").on(t.status),
    index("lessons_world_id_idx").on(t.worldId),
    uniqueIndex("lessons_world_chapter_step_idx").on(t.worldId, t.chapter, t.step),
  ],
).enableRLS();
