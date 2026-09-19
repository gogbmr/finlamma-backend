import { boolean, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idAndTimestamps } from "./_helpers";

// Fixed catalog of staff roles (super_admin, user_manager, content_uploader,
// content_publisher, quiz_maker - see docs/PRODUCT_SPEC.md "Staff roles").
// Extensible: new rows can be added later without a schema change.
export const roles = pgTable("roles", {
  ...idAndTimestamps(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
}).enableRLS();

// A single permission a role can be granted, keyed like "quiz.create" or
// "staff.manage" (see docs/DATA_MODEL.md). Seeded per-domain as each
// feature is actually built, not all up front.
export const permissions = pgTable("permissions", {
  ...idAndTimestamps(),
  key: text("key").notNull().unique(),
  description: text("description"),
}).enableRLS();

// Many-to-many join between roles and permissions.
export const rolePermissions = pgTable(
  "role_permissions",
  {
    ...idAndTimestamps(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("role_permissions_role_id_permission_id_idx").on(
      t.roleId,
      t.permissionId,
    ),
    index("role_permissions_permission_id_idx").on(t.permissionId),
  ],
).enableRLS();

// One row per staff identity - clerk_user_id is on the STAFF Clerk
// application, a separate Clerk app from the consumer app's `users` (see
// docs/ARCHITECTURE.md decision D2a); staff never has a row in `users`.
// `active` lets a super_admin revoke access without deleting the row (keeps
// activity_logs actor references meaningful).
export const staffMembers = pgTable(
  "staff_members",
  {
    ...idAndTimestamps(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    active: boolean("active").default(true).notNull(),
  },
  (t) => [index("staff_members_role_id_idx").on(t.roleId)],
).enableRLS();
