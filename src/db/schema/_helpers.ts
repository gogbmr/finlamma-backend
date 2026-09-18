import { timestamp, uuid } from "drizzle-orm/pg-core";

// Every table gets these: a random UUID primary key, and UTC timestamps
// (updated_at bumps itself on every write). See docs/DATA_MODEL.md.
export function idAndTimestamps() {
  return {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  };
}
