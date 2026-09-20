import { jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { idAndTimestamps } from "./_helpers";

// Generic admin-editable key/value config store. Introduced in Phase 2a for
// the consent-flow's tunable thresholds (parent_email_max_children,
// consent_resend_daily_cap - see src/server/compliance) and reused by every
// later phase's admin-editable constants (vm_issuance_multiplier, scoring
// constants, trade_unlock_world_order, ...) rather than each domain
// inventing its own settings table - see docs/DATA_MODEL.md.
export const settingsKv = pgTable("settings_kv", {
  ...idAndTimestamps(),
  key: text("key").notNull().unique(),
  value: jsonb("value").notNull(),
  description: text("description"),
}).enableRLS();
