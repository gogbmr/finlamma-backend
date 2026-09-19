// Bootstraps the very first super_admin staff_members row. There's no UI
// path for this: staff.manage itself requires an existing super_admin, so
// the first one can't be created through the admin dashboard. This script
// is the one deliberate, reviewable, repeatable way to do it instead of
// ad-hoc SQL. Refuses to run if a super_admin already exists (active or
// not - reassigning/reactivating an existing one is a normal admin action
// through the dashboard, not a re-bootstrap).
//
// Usage:
//   pnpm seed:super-admin <clerkUserId> --dry-run   # preview, no writes
//   pnpm seed:super-admin <clerkUserId>              # actually creates it
import "../envConfig";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { roles, staffMembers } from "../src/db/schema";
import { logActivity } from "../src/lib/activity-log";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const clerkUserId = args.find((a) => !a.startsWith("--"));

  if (!clerkUserId) {
    console.error("Usage: pnpm seed:super-admin <clerkUserId> [--dry-run]");
    process.exit(1);
  }
  if (!clerkUserId.startsWith("user_")) {
    console.error(
      `"${clerkUserId}" doesn't look like a Clerk user id (expected to start with "user_"). ` +
        "Copy it from the Clerk dashboard's STAFF application, not the consumer one.",
    );
    process.exit(1);
  }

  const [superAdminRole] = await db.select().from(roles).where(eq(roles.key, "super_admin")).limit(1);
  if (!superAdminRole) {
    console.error('No "super_admin" role found - run `pnpm db:seed` first.');
    process.exit(1);
  }

  const [existing] = await db
    .select()
    .from(staffMembers)
    .where(eq(staffMembers.roleId, superAdminRole.id))
    .limit(1);
  if (existing) {
    console.error(
      `Refusing to bootstrap: a super_admin already exists ` +
        `(staff_members.id=${existing.id}, clerk_user_id=${existing.clerkUserId}, active=${existing.active}). ` +
        "Manage existing staff through the admin dashboard instead.",
    );
    process.exit(1);
  }

  if (dryRun) {
    console.log("[dry run] No super_admin exists yet - this is safe to bootstrap.");
    console.log(
      `[dry run] Would insert staff_members: clerk_user_id=${clerkUserId}, role_id=${superAdminRole.id} (super_admin), active=true`,
    );
    console.log(
      "[dry run] Would log activity: actorType=system, action=staff.bootstrap_super_admin, " +
        `targetType=staff_member, metadata={clerkUserId: "${clerkUserId}"}`,
    );
    return;
  }

  const [created] = await db
    .insert(staffMembers)
    .values({ clerkUserId, roleId: superAdminRole.id, active: true })
    .returning();

  await logActivity({
    actorType: "system",
    action: "staff.bootstrap_super_admin",
    targetType: "staff_member",
    targetId: created.id,
    metadata: { clerkUserId },
  });

  console.log(`Created super_admin staff_members row ${created.id} for ${clerkUserId}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
