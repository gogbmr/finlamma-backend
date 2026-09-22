import { timestamp, uuid } from "drizzle-orm/pg-core";

// A leaf-level trilingual text field: {en, hi, hx}. Shared shape for every
// admin-editable content table (mentors, worlds, lessons, questions, ...) -
// see docs/DATA_MODEL.md's Learning section and docs/ARCHITECTURE.md's
// Phase 2b kickoff discussion for why this is one shared structure with
// localized leaves, not three duplicated content trees or a separate
// translations-table key. Kept here (not re-declared per domain) so the
// `.$type<LocalizedText>()` used by every content table's jsonb columns is
// the same type, not three structurally-identical-but-separate ones.
export type LocalizedText = { en: string; hi: string; hx: string };

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
