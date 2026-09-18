import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const actorTypeEnum = pgEnum("actor_type", ["user", "staff", "system"]);

// Append-only audit trail. No update or delete paths exist anywhere in the
// codebase for this table - see logActivity() in src/lib/activity-log.ts,
// the only way rows get written. actor_id is polymorphic (a users.id, a
// staff_members.id, or null for actor_type "system"), so it's not a foreign
// key. No updated_at: rows are immutable once written.
export const activityLogs = pgTable("activity_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  actorType: actorTypeEnum("actor_type").notNull(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ip: text("ip"),
  userAgent: text("user_agent"),
}).enableRLS();
