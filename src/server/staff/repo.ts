import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { roles, staffMembers } from "@/db/schema";
import { AppError } from "@/lib/errors";

export async function listRoles() {
  return db.select().from(roles).orderBy(asc(roles.name));
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
