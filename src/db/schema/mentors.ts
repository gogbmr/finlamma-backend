import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idAndTimestamps, type LocalizedText } from "./_helpers";
import { staffMembers } from "./staff";

export const mentorStatusEnum = pgEnum("mentor_status", ["draft", "published"]);

// Mentor evolution (PRODUCT_SPEC.md §1): the user's mentor changes as they
// clear worlds - Baby Lamma (World 1-3), Father Lamma (World 4-6), Grandpa
// Lamma (World 7+), per the prototype's MENTOR_INFO. worldRangeEnd is
// nullable for an open-ended range ("7+"). Admin-editable content, not
// hardcoded - see FEATURE_MAP WH-09/WH-10.
export const mentors = pgTable(
  "mentors",
  {
    ...idAndTimestamps(),
    order: integer("order").notNull(),
    key: text("key").notNull().unique(), // stable slug, e.g. "baby" - used by GET /api/v1/mentors/{key}
    name: jsonb("name").$type<LocalizedText>().notNull(),
    bio: jsonb("bio").$type<LocalizedText>().notNull(),
    worldRangeStart: integer("world_range_start").notNull(),
    worldRangeEnd: integer("world_range_end"), // null = open-ended
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
