// Seeds the fixed catalog of staff roles and permissions (see
// docs/PRODUCT_SPEC.md "Staff roles"). Idempotent - upserts by key, so it's
// safe to run again after adding a role/permission. Never removes an
// existing role, permission or grant, and never touches staff_members or
// users - it only adds/updates rows in roles, permissions and
// role_permissions. Run via `pnpm db:seed`.
import "../envConfig";
import { logActivity } from "../src/lib/activity-log";
import { db } from "../src/db/client";
import { permissions, rolePermissions, roles } from "../src/db/schema";

const ROLES = [
  {
    key: "super_admin",
    name: "Super Admin",
    description: "Full access to every admin area, including staff management.",
  },
  {
    key: "user_manager",
    name: "User Manager",
    description: "Manages user accounts and support issues.",
  },
  {
    key: "content_uploader",
    name: "Content Uploader",
    description: "Uploads draft lessons, quizzes and news content.",
  },
  {
    key: "content_publisher",
    name: "Content Publisher",
    description: "Reviews and publishes draft content.",
  },
  {
    key: "quiz_maker",
    name: "Quiz Maker",
    description: "Creates and edits quiz questions.",
  },
] as const;

const PERMISSIONS = [
  {
    key: "staff.manage",
    description: "Create, deactivate and assign roles to staff members.",
  },
  {
    key: "activity_log.view",
    description: "View the staff/user activity log.",
  },
  {
    key: "legal.manage",
    description: "Draft and publish versioned Terms/Privacy/Risk-disclosure documents.",
  },
  {
    key: "consent.view",
    description:
      "View parental-consent and legal-acceptance status for user accounts, read-only. " +
      "Every view of a parent's contact details is logged.",
  },
  {
    key: "mentor.manage",
    description:
      "Create mentors and edit a mentor's draft fields (name, bio, world range, art). " +
      "Cannot edit a mentor that's currently published - unpublish it first.",
  },
  {
    key: "mentor.publish",
    description: "Publish or unpublish a mentor, making it visible to (or hidden from) the app.",
  },
  {
    key: "world.manage",
    description:
      "Create worlds and edit a world's draft fields (title, tagline, theme, mentor, order, " +
      "art). Cannot edit a world that's currently published - unpublish it first.",
  },
  {
    key: "world.publish",
    description:
      "Publish or unpublish a world, making it visible to (or hidden from) the app. Publishing " +
      "requires the world's mentor to already be published.",
  },
  {
    key: "lesson.manage",
    description:
      "Create lessons and edit a lesson's draft fields (title, blurb, content). Cannot edit a " +
      "lesson that's currently published - unpublish it first.",
  },
  {
    key: "lesson.publish",
    description:
      "Publish or unpublish a lesson, making it visible to (or hidden from) the app. Publishing " +
      "requires the lesson's world to already be published.",
  },
] as const;

// Permissions granted to each role, by key. super_admin gets every
// permission that exists, explicitly listed (not an implicit wildcard) so
// role_permissions stays a readable audit trail of exactly what's granted.
// Other roles get permissions as their domain (quizzes, content, ...) is
// actually built in later phases.
const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  super_admin: [
    "staff.manage",
    "activity_log.view",
    "legal.manage",
    "mentor.manage",
    "mentor.publish",
    "world.manage",
    "world.publish",
    "lesson.manage",
    "lesson.publish",
  ],
  user_manager: ["consent.view"],
  content_uploader: ["mentor.manage", "world.manage", "lesson.manage"],
  content_publisher: ["mentor.publish", "world.publish", "lesson.publish"],
};

async function seed() {
  for (const role of ROLES) {
    await db
      .insert(roles)
      .values(role)
      .onConflictDoUpdate({
        target: roles.key,
        set: { name: role.name, description: role.description },
      });
  }

  for (const permission of PERMISSIONS) {
    await db
      .insert(permissions)
      .values(permission)
      .onConflictDoUpdate({
        target: permissions.key,
        set: { description: permission.description },
      });
  }

  const [allRoles, allPermissions] = await Promise.all([
    db.select().from(roles),
    db.select().from(permissions),
  ]);
  const roleIdByKey = new Map(allRoles.map((r) => [r.key, r.id]));
  const permissionIdByKey = new Map(allPermissions.map((p) => [p.key, p.id]));

  let grantedCount = 0;
  for (const [roleKey, permissionKeys] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleIdByKey.get(roleKey);
    if (!roleId) throw new Error(`Unknown role key in ROLE_PERMISSIONS: ${roleKey}`);
    for (const permissionKey of permissionKeys) {
      const permissionId = permissionIdByKey.get(permissionKey);
      if (!permissionId) {
        throw new Error(`Unknown permission key in ROLE_PERMISSIONS: ${permissionKey}`);
      }
      // .returning() comes back empty on a conflict (already granted), so
      // this only fires - and only logs - for a grant that's actually new.
      const inserted = await db
        .insert(rolePermissions)
        .values({ roleId, permissionId })
        .onConflictDoNothing({
          target: [rolePermissions.roleId, rolePermissions.permissionId],
        })
        .returning({ id: rolePermissions.id });

      if (inserted.length > 0) {
        grantedCount++;
        await logActivity({
          actorType: "system",
          action: "role.permission_granted",
          targetType: "role",
          targetId: roleId,
          metadata: { roleKey, permissionKey, source: "seed-roles" },
        });
      }
    }
  }

  console.log(
    `Seeded ${ROLES.length} roles, ${PERMISSIONS.length} permissions, ` +
      `${grantedCount} new grant(s) logged.`,
  );
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
