import { boolean, index, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
//
// HR-record fields added for the Staff admin page (not identity/auth -
// Clerk still owns that, D2/D2a unchanged): `email` is a denormalized copy
// of the address the Clerk invite was actually sent to (captured once at
// invite/join time, shown in the admin table instead of a raw Clerk user
// id) - it can drift from Clerk's own copy if someone changes their email
// there afterward, accepted as a rare, low-stakes case rather than adding a
// live Clerk API call to every table render. `gender`/`phone`/`address`/
// `photoKey` have no other source of truth at all (Clerk is authentication
// identity, not an HR system) - all four nullable, since every existing
// staff row predates this and nothing requires backfilling them. `photoKey`
// follows the same S3-object-key + signed-URL pattern as mentor/world art
// (src/lib/s3.ts), never a public URL stored directly.
export const staffGenderEnum = pgEnum("staff_gender", ["male", "female", "other", "prefer_not_to_say"]);

export const staffMembers = pgTable(
  "staff_members",
  {
    ...idAndTimestamps(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    active: boolean("active").default(true).notNull(),
    email: text("email"),
    gender: staffGenderEnum("gender"),
    phone: text("phone"),
    address: text("address"),
    photoKey: text("photo_key"),
  },
  (t) => [index("staff_members_role_id_idx").on(t.roleId)],
).enableRLS();
