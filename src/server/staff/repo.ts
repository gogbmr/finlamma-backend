import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { permissions, rolePermissions, roles, staffMembers } from "@/db/schema";
import { AppError } from "@/lib/errors";

export async function listRoles() {
  return db.select().from(roles).orderBy(asc(roles.name));
}

export async function getRoleById(id: string) {
  const [row] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  return row;
}

export async function getStaffMemberById(id: string) {
  const [row] = await db.select().from(staffMembers).where(eq(staffMembers.id, id)).limit(1);
  return row;
}

// Same permission lookup as requireStaff() in src/lib/auth.ts, reused here
// so the admin-lockout guard in service.ts can check "does this role grant
// staff.manage" without a live Clerk session in scope.
export async function roleHasPermission(roleId: string, permission: string): Promise<boolean> {
  const [grant] = await db
    .select({ id: rolePermissions.id })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(rolePermissions.roleId, roleId), eq(permissions.key, permission)))
    .limit(1);
  return !!grant;
}

// How many active staff members currently hold the given permission -
// used by the admin-lockout guard to refuse an action that would leave
// zero of them.
export async function countActiveStaffWithPermission(permission: string): Promise<number> {
  const rows = await db
    .select({ id: staffMembers.id })
    .from(staffMembers)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, staffMembers.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(staffMembers.active, true), eq(permissions.key, permission)));
  return rows.length;
}

export async function listStaffWithRoles() {
  return db
    .select({
      id: staffMembers.id,
      clerkUserId: staffMembers.clerkUserId,
      active: staffMembers.active,
      createdAt: staffMembers.createdAt,
      roleId: roles.id,
      roleName: roles.name,
    })
    .from(staffMembers)
    .innerJoin(roles, eq(roles.id, staffMembers.roleId))
    .orderBy(asc(staffMembers.createdAt));
}

// Called from the STAFF app's Clerk webhook (user.created) once an invited
// person accepts and signs up - the invitation's publicMetadata carries the
// role, so this is what actually creates the staff_members row (invites
// themselves live entirely in Clerk, we never store a "pending" row for
// one). onConflictDoUpdate makes this idempotent against webhook
// redelivery and safe if the same person is re-invited with a new role.
export async function upsertStaffMemberFromInvite(input: { clerkUserId: string; roleId: string }) {
  const [row] = await db
    .insert(staffMembers)
    .values({ ...input, active: true })
    .onConflictDoUpdate({
      target: staffMembers.clerkUserId,
      set: { roleId: input.roleId, active: true },
    })
    .returning();
  return row;
}

// Called from the STAFF app's Clerk webhook (user.deleted) so a staff
// member deleted directly in the Clerk dashboard loses admin access here
// too, not just in Clerk. A no-op (returns undefined) if this clerk_user_id
// was never a staff member - e.g. someone who signed up without an invite.
export async function deactivateStaffMemberByClerkId(clerkUserId: string) {
  const [updated] = await db
    .update(staffMembers)
    .set({ active: false })
    .where(eq(staffMembers.clerkUserId, clerkUserId))
    .returning();
  return updated;
}

export async function setStaffActive(id: string, active: boolean) {
  const [updated] = await db
    .update(staffMembers)
    .set({ active })
    .where(eq(staffMembers.id, id))
    .returning();
  if (!updated) throw new AppError("NOT_FOUND", "Staff member not found");
  return updated;
}

export async function updateStaffRole(id: string, roleId: string) {
  const [updated] = await db
    .update(staffMembers)
    .set({ roleId })
    .where(eq(staffMembers.id, id))
    .returning();
  if (!updated) throw new AppError("NOT_FOUND", "Staff member not found");
  return updated;
}
