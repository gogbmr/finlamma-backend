import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idAndTimestamps, type LocalizedText } from "./_helpers";
import { mentors } from "./mentors";
import { staffMembers } from "./staff";

export const worldStatusEnum = pgEnum("world_status", ["draft", "published"]);

// D25 (docs/ARCHITECTURE.md): worlds are a fully data-driven, unbounded
// content type - staff decide how many exist (5, 7, 10, 20, any number),
// their names, order and art. The 7 prototype worlds seeded by
// scripts/seed-worlds.ts are just initial seed data, fully editable,
// reorderable and (if empty of lessons) deletable - nothing in this schema
// or the code reading it assumes a fixed count. mentorId is a real FK, not
// a computed world-range lookup - publishing a world requires its mentor to
// already be published, and a mentor can't be unpublished while a published
// world still references it (see src/server/mentors/service.ts
// unpublishMentor and src/server/worlds/service.ts publishWorld). `order`
// is the only unlock signal that matters (sequential: clearing a world's
// Boss Quiz unlocks the next) - displayXpTarget is a cosmetic progress
// indicator only, never a gate, per docs/DATA_MODEL.md. `theme` is a
// staff-chosen hex color (validated in src/server/worlds/schemas.ts), not
// an enum of fixed prototype themes.
export const worlds = pgTable(
  "worlds",
  {
    ...idAndTimestamps(),
    order: integer("order").notNull(),
    // A stable 2-letter code (e.g. "MW" for Money World), staff-set, used
    // only to build a certificate id (FL-<code>-<year>-<seq>, see
    // src/server/certificates). Nullable so it doesn't retroactively break
    // an already-published world (same "applies going forward only"
    // reasoning as D24's boss-quiz-lesson publish check) - required by
    // validateWorldForPublish for any NEW publish from here on. The 7
    // pre-existing seeded/published worlds are backfilled once by
    // scripts/backfill-world-codes.ts.
    code: text("code").unique(),
    title: jsonb("title").$type<LocalizedText>().notNull(),
    tagline: jsonb("tagline").$type<LocalizedText>().notNull(),
    theme: text("theme").notNull(), // cosmetic accent color/key, e.g. "#7C3AED"
    displayXpTarget: integer("display_xp_target").notNull(),
    artKey: text("art_key"), // S3 object key (src/lib/s3.ts), null until uploaded
    mentorId: uuid("mentor_id")
      .notNull()
      .references(() => mentors.id, { onDelete: "restrict" }),
    status: worldStatusEnum("status").default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by").references(() => staffMembers.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("worlds_status_idx").on(t.status),
    uniqueIndex("worlds_order_idx").on(t.order),
    index("worlds_mentor_id_idx").on(t.mentorId),
  ],
).enableRLS();
