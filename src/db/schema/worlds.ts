import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idAndTimestamps, type LocalizedText } from "./_helpers";
import { mentors } from "./mentors";
import { staffMembers } from "./staff";

export const worldStatusEnum = pgEnum("world_status", ["draft", "published"]);

// The 7 worlds (Money World -> ... -> Elite Summit), PRODUCT_SPEC.md §1.
// mentorId is a real FK, not a computed world-range lookup - publishing a
// world requires its mentor to already be published, and a mentor can't be
// unpublished while a published world still references it (see
// src/server/mentors/service.ts unpublishMentor and
// src/server/worlds/service.ts publishWorld). `order` is the only unlock
// signal that matters (sequential: clearing a world's Boss Quiz unlocks the
// next) - displayXpTarget is a cosmetic progress indicator only, never a
// gate, per docs/DATA_MODEL.md.
export const worlds = pgTable(
  "worlds",
  {
    ...idAndTimestamps(),
    order: integer("order").notNull(),
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
