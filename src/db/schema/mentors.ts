import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idAndTimestamps, type LocalizedText } from "./_helpers";
import { staffMembers } from "./staff";

export const mentorStatusEnum = pgEnum("mentor_status", ["draft", "published"]);

// D25 (docs/ARCHITECTURE.md): mentors are a fully data-driven, unbounded
// content type - staff create any number of them. Assignment to a world
// lives ONLY on worlds.mentorId (a real FK, chosen by staff in the world
// editor); a mentor carries no notion of which world(s) it "belongs to" -
// one mentor can cover many worlds, and "Used by" in the admin editor is a
// read-only query of worlds.mentorId, never a stored range on this table.
// `persona` is free-text voice/tone notes staff write for the Doubt Zone AI
// chat to stay in character as this mentor - not learner-facing, so it's a
// single string, not a {en,hi,hx} localized field like name/bio.
export const mentors = pgTable(
  "mentors",
  {
    ...idAndTimestamps(),
    order: integer("order").notNull(),
    key: text("key").notNull().unique(), // stable slug, e.g. "baby" - used by GET /api/v1/mentors/{key}
    name: jsonb("name").$type<LocalizedText>().notNull(),
    bio: jsonb("bio").$type<LocalizedText>().notNull(),
    persona: text("persona").notNull().default(""),
    artKey: text("art_key"), // S3 object key (src/lib/s3.ts), null until uploaded
    status: mentorStatusEnum("status").default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by").references(() => staffMembers.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("mentors_status_idx").on(t.status),
    uniqueIndex("mentors_order_idx").on(t.order),
  ],
).enableRLS();
