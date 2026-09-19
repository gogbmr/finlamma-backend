import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { roles, staffMembers } from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
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

export async function createStaffMember(input: { clerkUserId: string; roleId: string }) {
  try {
    const [created] = await db.insert(staffMembers).values(input).returning();
    return created;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(
        "CONFLICT",
        "A staff member with this Clerk user ID already exists",
      );
    }
    throw err;
  }
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
