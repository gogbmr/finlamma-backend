import { and, asc, count, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { permissions, rolePermissions, roles, staffMembers } from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { UpdateStaffProfileInput } from "./schemas";

// Same shape as economy/repo.ts's and trading/repo.ts's DbOrTx - lets the
// handful of read/write functions below run inside withPermissionLocks'
// transaction instead of against the top-level `db`, while every other
// existing caller (nav-visibility, the admin layout, ...) keeps working
// unchanged via the default.
export type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// Closes a TOCTOU race security-auditor flagged in the admin-lockout guard
// (src/server/staff/service.ts's wouldLockOutStaffAdmin/setRolePermissions):
// without this, two concurrent privileged actions could each read "still
// >=2 active holders" of a critical permission before either write commits,
// and both proceed - leaving zero. A transaction-scoped Postgres advisory
// lock (auto-released at commit/rollback, never needs manual unlocking) per
// permission key serializes any two mutations that could affect who holds
// ANY of the same keys, system-wide, regardless of which staff/role rows
// they actually touch - which is what makes this correct even though the
// "last active holder" count spans an unbounded, dynamic set of rows that a
// plain row-level FOR UPDATE lock couldn't pin down in advance. Keys are
// sorted first so two calls locking the same two keys always acquire them
// in the same order (lock-ordering, not deadlock-breaking - Postgres would
// also just block, not deadlock, since this never nests two multi-key
// calls inside each other). hashtext() collapses each key to the 32-bit int
// pg_advisory_xact_lock expects; a hash collision between two different
// keys only ever causes EXTRA serialization (locking a superset), never a
// missed conflict.
export async function withPermissionLocks<T>(
  permissionKeys: readonly string[],
  fn: (tx: DbOrTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    for (const key of [...permissionKeys].sort()) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
    }
    return fn(tx);
  });
}

export async function listRoles() {
  return db.select().from(roles).orderBy(asc(roles.name));
}

export async function getRoleById(id: string, txDb: DbOrTx = db) {
  const [row] = await txDb.select().from(roles).where(eq(roles.id, id)).limit(1);
  return row;
}

export async function getStaffMemberById(id: string, txDb: DbOrTx = db) {
  const [row] = await txDb
    .select()
    .from(staffMembers)
    .where(eq(staffMembers.id, id))
    .limit(1);
  return row;
}

// Same permission lookup as requireStaff() in src/lib/auth.ts, reused here
// so the admin-lockout guard in service.ts can check "does this role grant
// staff.edit" without a live Clerk session in scope. Single-permission
// call sites (requireStaff, requireStaffAny, the admin-lockout guard) stay
// on this - it's the right shape for "does this one permission exist",
// one indexed round trip. Never use this in a loop/Promise.all to check
// several permissions at once - see getPermissionKeysForRole below, added
// specifically because the admin shell used to do exactly that (22 calls
// for one role) - see docs/ARCHITECTURE.md D72.
export async function roleHasPermission(
  roleId: string,
  permission: string,
  txDb: DbOrTx = db,
): Promise<boolean> {
  const [grant] = await txDb
    .select({ id: rolePermissions.id })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(
      and(eq(rolePermissions.roleId, roleId), eq(permissions.key, permission)),
    )
    .limit(1);
  return !!grant;
}

// Every permission key a role holds, in ONE query - for a caller that
// needs to check several permissions for the same role at once (e.g. the
// admin shell's nav-visibility check), instead of one roleHasPermission()
// round trip per key. D72 (docs/ARCHITECTURE.md): the admin shell used to
// run exactly this as 22 separate concurrent queries (even batched through
// a concurrency limiter, still 22 round trips - 4.5s even when it worked,
// and still capable of tripping the transaction-pooler pipelining hang
// under cross-request pool contention). Returns a Set for O(1)
// `.has(key)` checks at each call site.
export async function getPermissionKeysForRole(
  roleId: string,
  txDb: DbOrTx = db,
): Promise<Set<string>> {
  const rows = await txDb
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, roleId));
  return new Set(rows.map((r) => r.key));
}

// How many active staff members currently hold the given permission -
// used by the admin-lockout guard to refuse an action that would leave
// zero of them.
export async function countActiveStaffWithPermission(
  permission: string,
  txDb: DbOrTx = db,
): Promise<number> {
  const rows = await txDb
    .select({ id: staffMembers.id })
    .from(staffMembers)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, staffMembers.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(staffMembers.active, true), eq(permissions.key, permission)));
  return rows.length;
}

// How many ACTIVE staff members hold this role - used by the lockout guard
// in service.ts's setRolePermissions (would stripping a permission from
// this role leave zero active holders of it). Deliberately active-only,
// unlike countStaffWithRole below (which exists for a different question -
// role deletion - where even an inactive holder still blocks it via the FK).
export async function countActiveStaffWithRole(roleId: string, txDb: DbOrTx = db): Promise<number> {
  const [row] = await txDb
    .select({ n: count() })
    .from(staffMembers)
    .where(and(eq(staffMembers.roleId, roleId), eq(staffMembers.active, true)));
  return row?.n ?? 0;
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
      email: staffMembers.email,
      gender: staffMembers.gender,
      phone: staffMembers.phone,
      address: staffMembers.address,
      photoKey: staffMembers.photoKey,
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
export async function upsertStaffMemberFromInvite(input: {
  clerkUserId: string;
  roleId: string;
  email?: string;
}) {
  const [row] = await db
    .insert(staffMembers)
    .values({ ...input, active: true })
    .onConflictDoUpdate({
      target: staffMembers.clerkUserId,
      // email intentionally not overwritten on conflict (re-invite) if the
      // new invite didn't carry one - never clobber an already-known email
      // with a blank.
      set: {
        roleId: input.roleId,
        active: true,
        ...(input.email ? { email: input.email } : {}),
      },
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

export async function setStaffActive(id: string, active: boolean, txDb: DbOrTx = db) {
  const [updated] = await txDb
    .update(staffMembers)
    .set({ active })
    .where(eq(staffMembers.id, id))
    .returning();
  if (!updated) throw new AppError("NOT_FOUND", "Staff member not found");
  return updated;
}

export async function updateStaffRole(id: string, roleId: string, txDb: DbOrTx = db) {
  const [updated] = await txDb
    .update(staffMembers)
    .set({ roleId })
    .where(eq(staffMembers.id, id))
    .returning();
  if (!updated) throw new AppError("NOT_FOUND", "Staff member not found");
  return updated;
}

// HR-record fields only - gender/phone/address, self-service or
// staff.edit-gated (service.ts decides which applies). `undefined` means
// "not part of this update" (field omitted from the form), distinct from
// `null` which means "clear it back out" - callers pass through whichever
// of these two react-hook-form/Zod already produced, never translate one
// into the other here.
export async function updateStaffProfile(
  id: string,
  input: Pick<UpdateStaffProfileInput, "gender" | "phone" | "address">,
) {
  const [updated] = await db
    .update(staffMembers)
    .set(input)
    .where(eq(staffMembers.id, id))
    .returning();
  if (!updated) throw new AppError("NOT_FOUND", "Staff member not found");
  return updated;
}

export async function setStaffPhotoKey(id: string, photoKey: string) {
  const [updated] = await db
    .update(staffMembers)
    .set({ photoKey })
    .where(eq(staffMembers.id, id))
    .returning();
  if (!updated) throw new AppError("NOT_FOUND", "Staff member not found");
  return updated;
}

export async function listPermissions(txDb: DbOrTx = db) {
  return txDb.select().from(permissions).orderBy(asc(permissions.key));
}

export async function createRole(input: { key: string; name: string; description?: string | null }) {
  const [row] = await db.insert(roles).values(input).returning();
  return row;
}

export async function updateRole(id: string, input: { name: string; description?: string | null }) {
  const [updated] = await db.update(roles).set(input).where(eq(roles.id, id)).returning();
  if (!updated) throw new AppError("NOT_FOUND", "Role not found");
  return updated;
}

// How many staff members (any active state) currently hold this role -
// used to block deleting a role still in use, same "can't remove something
// still referenced" shape as worlds/service.ts's deleteWorld checking for
// child lessons.
export async function countStaffWithRole(roleId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(staffMembers)
    .where(eq(staffMembers.roleId, roleId));
  return row?.n ?? 0;
}

export async function deleteRole(id: string) {
  const [deleted] = await db.delete(roles).where(eq(roles.id, id)).returning();
  return deleted ?? null;
}

// Full replace of a role's permission grants, in one transaction - the
// Roles & Permissions UI always sends the complete intended set (every
// permission as a checkbox already reflecting its current state), never an
// incremental grant/revoke, so this is "make the DB match exactly this
// list," not "add these, remove those."
export async function setRolePermissions(
  roleId: string,
  permissionIds: string[],
  txDb: DbOrTx = db,
) {
  await txDb.transaction(async (tx) => {
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    if (permissionIds.length > 0) {
      await tx
        .insert(rolePermissions)
        .values(permissionIds.map((permissionId) => ({ roleId, permissionId })));
    }
  });
}
