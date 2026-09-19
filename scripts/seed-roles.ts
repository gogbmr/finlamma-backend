// Seeds the fixed catalog of staff roles and permissions (see
// docs/PRODUCT_SPEC.md "Staff roles"). Idempotent - upserts by key, so it's
// safe to run again after adding a role/permission. Run via `pnpm db:seed`.
import "../envConfig";
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
] as const;

// Permissions granted to each role, by key. Only super_admin has any for
// now - other roles get permissions as their domain (quizzes, content, ...)
// is actually built in later phases.
const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  super_admin: ["staff.manage", "activity_log.view"],
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

  // Sequential, not Promise.all: src/db/client.ts caps the pool at max: 1
  // (Supabase's serverless guidance), and two concurrent queries against
  // that single pooled connection hang indefinitely rather than queueing -
  // seen firsthand while building this script.
  const allRoles = await db.select().from(roles);
  const allPermissions = await db.select().from(permissions);
  const roleIdByKey = new Map(allRoles.map((r) => [r.key, r.id]));
  const permissionIdByKey = new Map(allPermissions.map((p) => [p.key, p.id]));

  for (const [roleKey, permissionKeys] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleIdByKey.get(roleKey);
    if (!roleId) throw new Error(`Unknown role key in ROLE_PERMISSIONS: ${roleKey}`);
    for (const permissionKey of permissionKeys) {
      const permissionId = permissionIdByKey.get(permissionKey);
      if (!permissionId) {
        throw new Error(`Unknown permission key in ROLE_PERMISSIONS: ${permissionKey}`);
      }
      await db
        .insert(rolePermissions)
        .values({ roleId, permissionId })
        .onConflictDoNothing({
          target: [rolePermissions.roleId, rolePermissions.permissionId],
        });
    }
  }

  console.log(`Seeded ${ROLES.length} roles, ${PERMISSIONS.length} permissions.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
