import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { logActivity } from "@/lib/activity-log";
import { DB_CONCURRENCY_LIMIT, runWithConcurrencyLimit } from "@/lib/concurrency-limit";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import {
  imageContentType,
  imageExtension,
  MAX_IMAGE_BYTES,
  sniffImageType,
} from "@/lib/image";
import { getSignedDownloadUrl, uploadObject } from "@/lib/s3";
import type {
  CreateRoleInput,
  InviteStaffMemberInput,
  SetRolePermissionsInput,
  UpdateRoleInput,
  UpdateStaffProfileInput,
} from "./schemas";
import type { DbOrTx } from "./repo";
import {
  countActiveStaffWithPermission,
  countActiveStaffWithRole,
  countStaffWithRole,
  createRole as createRoleRow,
  deactivateStaffMemberByClerkId,
  deleteRole as deleteRoleRow,
  getPermissionKeysForRole,
  getRoleById,
  getStaffMemberById,
  listPermissions,
  listRoles,
  listStaffWithRoles,
  roleHasPermission,
  setRolePermissions as setRolePermissionsRow,
  setStaffActive,
  setStaffPhotoKey,
  updateRole as updateRoleRow,
  updateStaffProfile as updateStaffProfileRow,
  updateStaffRole,
  upsertStaffMemberFromInvite,
  withPermissionLocks,
} from "./repo";

// `actor` is the staff_members row of whoever is performing the action
// (from requireStaff("<permission>") in the caller), used as the activity
// log actorId - never the target being changed.
type Actor = { id: string };
// Self-or-permission checks (profile fields, photo) need the actor's role
// too - requireStaff()/getStaffMember() already return the full staff row,
// which satisfies this structurally.
type ActorWithRole = Actor & { roleId: string };
type RequestMeta = ReturnType<typeof requestMeta>;

// The permissions that together let staff administer staff/roles at all -
// guarded below so no combination of deactivate/role-change/permission-edit
// actions can ever leave zero active staff members able to grant any of
// them back. staff.edit (change someone's role), staff.delete (deactivate/
// reactivate someone), and roles.edit/roles.create/roles.delete (manage the
// role catalog and its grants) - a role could plausibly hold any subset of
// these without the others, so each is checked independently rather than
// assuming they travel together. Permission-driven (not hardcoded to
// "super_admin") since roles are meant to be extensible - see
// requireStaff() in src/lib/auth.ts.
const STAFF_ADMIN_PERMISSIONS = [
  "staff.edit",
  "staff.delete",
  "roles.edit",
  "roles.create",
  "roles.delete",
] as const;

// True if applying `newState` to `staffId` would leave no active staff
// member holding `permission` - e.g. deactivating or demoting the only
// active super_admin. Only ever true when the target row itself currently
// holds the permission and wouldn't after the change; a target that never
// held it, or still holds it after, is never blocked. `tx` lets the caller
// run this inside withPermissionLocks' transaction (see below) so the read
// and the eventual write are serialized against any other concurrent
// mutation of the same permission's holder count - without it, two
// concurrent calls could each read "still >=2 active holders" before
// either commits, and both proceed, leaving zero (TOCTOU race flagged by a
// security-auditor pass, 2026-11-23).
async function wouldLeaveNoActiveHolder(
  staffId: string,
  permission: string,
  newState: { active: boolean; roleId?: string },
  tx: DbOrTx,
): Promise<boolean> {
  const current = await getStaffMemberById(staffId, tx);
  if (!current) return false; // let the update itself 404

  const currentlyHolds = current.active && (await roleHasPermission(current.roleId, permission, tx));
  if (!currentlyHolds) return false;

  const roleIdAfterChange = newState.roleId ?? current.roleId;
  const stillHolds = newState.active && (await roleHasPermission(roleIdAfterChange, permission, tx));
  if (stillHolds) return false;

  const totalActiveHolders = await countActiveStaffWithPermission(permission, tx);
  return totalActiveHolders <= 1;
}

// Blocks the action if it would zero out active holders of ANY critical
// permission, not just one - see STAFF_ADMIN_PERMISSIONS above. Always
// call this from inside withPermissionLocks(STAFF_ADMIN_PERMISSIONS, ...) -
// passing `tx` through is what makes the check-then-write atomic against
// concurrent calls; calling it with the bare top-level db defeats the lock.
async function wouldLockOutStaffAdmin(
  staffId: string,
  newState: { active: boolean; roleId?: string },
  tx: DbOrTx,
): Promise<string | null> {
  for (const permission of STAFF_ADMIN_PERMISSIONS) {
    if (await wouldLeaveNoActiveHolder(staffId, permission, newState, tx)) return permission;
  }
  return null;
}

// Public metadata key on the Clerk invitation, which Clerk copies onto the
// resulting User's own publicMetadata once they accept and sign up (see
// Clerk's docs on invitation metadata) - this is how the STAFF app's
// user.created webhook (src/app/api/webhooks/clerk-staff/route.ts) knows
// which role to create the staff_members row with, without us ever storing
// a separate "pending invite" row of our own.
export const STAFF_INVITE_ROLE_METADATA_KEY = "finlammaStaffRoleId";

export async function getStaffPageData() {
  const [staffRows, roles] = await Promise.all([listStaffWithRoles(), listRoles()]);
  // Signed URL resolution only (S3, not Postgres) - safe as a bare
  // Promise.all regardless of staff count, same reasoning as
  // src/server/mentors/service.ts's getPublicMentors.
  // promise-all-db-concurrency-ok: S3-backed, not a Postgres query
  const staff = await Promise.all(
    staffRows.map(async (row) => ({
      ...row,
      photoUrl: row.photoKey ? await getSignedDownloadUrl(row.photoKey) : null,
    })),
  );
  return { staff, roles };
}

export async function inviteStaffMember(
  actor: Actor,
  input: InviteStaffMemberInput,
  meta: RequestMeta,
) {
  const role = await getRoleById(input.roleId);
  if (!role) throw new AppError("NOT_FOUND", "Role not found");

  const client = await clerkClient();

  let invitation;
  try {
    invitation = await client.invitations.createInvitation({
      emailAddress: input.email,
      redirectUrl: `${env.APP_URL}/admin/sign-in`,
      publicMetadata: { [STAFF_INVITE_ROLE_METADATA_KEY]: input.roleId },
    });
  } catch {
    // Never log the raw Clerk SDK error - same reasoning as requireUser's
    // catch in src/lib/auth.ts, this path runs with the secret key in scope.
    console.error("Clerk staff invitation failed unexpectedly");
    throw new AppError("SERVICE_UNAVAILABLE", "Could not send the invitation right now");
  }

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "staff.invited",
    targetType: "staff_invitation",
    targetId: invitation.id,
    metadata: { email: input.email, roleId: input.roleId },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return invitation;
}

// Called from the STAFF app's webhook on user.created. Not every staff-app
// signup is an invited one (Clerk's own sign-up page is reachable directly
// unless disabled in the dashboard), so a missing/invalid role id in
// publicMetadata is a normal no-op, not an error.
//
// Security note (see docs/ARCHITECTURE.md decision D14 and the regression
// test in src/app/api/webhooks/clerk-staff/route.test.ts): this MUST only
// ever be driven by public_metadata, never unsafe_metadata - Clerk lets a
// signed-in user set unsafe_metadata on themselves via the client SDK, so
// reading that field here would let anyone who signs up self-grant a
// staff role. public_metadata can only be written with the Backend API
// (our secret key), which callers never have.
export async function completeStaffInviteFromClerkEvent(
  clerkUserId: string,
  publicMetadata: Record<string, unknown>,
  email?: string,
) {
  const roleId = publicMetadata[STAFF_INVITE_ROLE_METADATA_KEY];
  if (typeof roleId !== "string") return;

  const staff = await upsertStaffMemberFromInvite({ clerkUserId, roleId, email });

  await logActivity({
    actorType: "system",
    action: "staff.joined_via_invite",
    targetType: "staff_member",
    targetId: staff.id,
    metadata: { clerkUserId, roleId },
  });
}

// Called from the STAFF app's webhook on user.deleted, so deleting someone
// directly in the Clerk dashboard also revokes their admin access here -
// not just staff.delete-driven deactivation. No-op if they were never staff.
export async function deactivateStaffMemberFromClerkEvent(clerkUserId: string) {
  const updated = await deactivateStaffMemberByClerkId(clerkUserId);
  if (!updated) return;

  await logActivity({
    actorType: "system",
    action: "staff.deactivated_from_clerk",
    targetType: "staff_member",
    targetId: updated.id,
    metadata: { clerkUserId },
  });
}

export async function setStaffMemberActive(
  actor: Actor,
  staffId: string,
  active: boolean,
  meta: RequestMeta,
) {
  // withPermissionLocks: the lockout check below reads live holder counts
  // and this write changes them, inside the same transaction and advisory
  // lock - see wouldLeaveNoActiveHolder's comment for why that matters.
  const updated = await withPermissionLocks(STAFF_ADMIN_PERMISSIONS, async (tx) => {
    if (!active) {
      const blockedOn = await wouldLockOutStaffAdmin(staffId, { active: false }, tx);
      if (blockedOn) {
        throw new AppError(
          "CONFLICT",
          `Can't deactivate the last active staff member with "${blockedOn}" - ` +
            "give someone else that permission first.",
        );
      }
    }
    return setStaffActive(staffId, active, tx);
  });

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: active ? "staff.activated" : "staff.deactivated",
    targetType: "staff_member",
    targetId: staffId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return updated;
}

export async function changeStaffMemberRole(
  actor: Actor,
  staffId: string,
  roleId: string,
  meta: RequestMeta,
) {
  const role = await getRoleById(roleId);
  if (!role) throw new AppError("NOT_FOUND", "Role not found");

  // withPermissionLocks - see setStaffMemberActive's comment.
  const updated = await withPermissionLocks(STAFF_ADMIN_PERMISSIONS, async (tx) => {
    const blockedOn = await wouldLockOutStaffAdmin(staffId, { active: true, roleId }, tx);
    if (blockedOn) {
      throw new AppError(
        "CONFLICT",
        `Can't change this staff member's role - it would leave no active staff member with ` +
          `"${blockedOn}".`,
      );
    }
    return updateStaffRole(staffId, roleId, tx);
  });

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "staff.role_changed",
    targetType: "staff_member",
    targetId: staffId,
    metadata: { roleId },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return updated;
}

// HR-record fields only (gender/phone/address) - self-service OR
// staff.edit, per the user's explicit choice: a staff member can always
// edit their own fields, and anyone holding staff.edit can edit anyone's.
// Never checks a permission for the self-edit path - that would make
// staff.edit a prerequisite for editing your OWN profile, which defeats the
// point of "self-service" being one of the two allowed paths.
export async function updateStaffProfile(
  actor: ActorWithRole,
  input: UpdateStaffProfileInput,
  meta: RequestMeta,
) {
  if (actor.id !== input.staffId) {
    if (!(await roleHasPermission(actor.roleId, "staff.edit"))) {
      throw new AppError("FORBIDDEN", "Missing permission: staff.edit");
    }
  }

  const updated = await updateStaffProfileRow(input.staffId, {
    gender: input.gender,
    phone: input.phone,
    address: input.address,
  });

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "staff.profile_updated",
    targetType: "staff_member",
    targetId: input.staffId,
    metadata: { self: actor.id === input.staffId },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return updated;
}

// Same self-or-staff.edit authorization as updateStaffProfile. Mirrors
// src/server/mentors/service.ts's uploadMentorArt: never trust a client
// Content-Type or filename, sniff the real bytes, enforce MAX_IMAGE_BYTES,
// and write to a fresh key per upload (never overwrite/delete the old
// object, so a bad upload is revertible).
export async function uploadStaffPhoto(
  actor: ActorWithRole,
  staffId: string,
  file: { body: Buffer },
  meta: RequestMeta,
) {
  if (actor.id !== staffId) {
    if (!(await roleHasPermission(actor.roleId, "staff.edit"))) {
      throw new AppError("FORBIDDEN", "Missing permission: staff.edit");
    }
  }

  const current = await getStaffMemberById(staffId);
  if (!current) throw new AppError("NOT_FOUND", "Staff member not found");

  if (file.body.byteLength > MAX_IMAGE_BYTES) {
    throw new AppError("VALIDATION_FAILED", "Photo must be 2MB or smaller");
  }

  const detectedType = sniffImageType(file.body);
  if (!detectedType) {
    throw new AppError("VALIDATION_FAILED", "Photo must be a valid PNG, JPEG or WebP image");
  }

  const photoKey = `staff/${staffId}/${randomUUID()}.${imageExtension(detectedType)}`;
  await uploadObject(photoKey, file.body, imageContentType(detectedType));
  const updated = await setStaffPhotoKey(staffId, photoKey);

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "staff.photo_uploaded",
    targetType: "staff_member",
    targetId: staffId,
    metadata: { self: actor.id === staffId, previousPhotoKey: current.photoKey, newPhotoKey: photoKey },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return updated;
}

// Roles & Permissions admin page: every role, every permission, and which
// permissions each role currently holds - everything the page needs in one
// call. The per-role grant lookup is N queries (one per role), so it goes
// through runWithConcurrencyLimit rather than a bare Promise.all, same as
// any other 3+-call DB batch (CLAUDE.md rule 15) - a role count staying
// small today doesn't make a bare Promise.all here safe going forward.
export async function getRolesPageData() {
  const [roleRows, permissionRows] = await Promise.all([listRoles(), listPermissions()]);

  const grantEntries = await runWithConcurrencyLimit(
    roleRows.map(
      (role) => async () => [role.id, await getPermissionKeysForRole(role.id)] as const,
    ),
    DB_CONCURRENCY_LIMIT,
  );

  return {
    roles: roleRows,
    permissions: permissionRows,
    permissionKeysByRoleId: new Map(grantEntries),
  };
}

export async function createRole(actor: Actor, input: CreateRoleInput, meta: RequestMeta) {
  const role = await createRoleRow(input);

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "role.created",
    targetType: "role",
    targetId: role.id,
    metadata: { key: input.key, name: input.name },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return role;
}

export async function updateRole(actor: Actor, input: UpdateRoleInput, meta: RequestMeta) {
  const updated = await updateRoleRow(input.roleId, {
    name: input.name,
    description: input.description,
  });

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "role.updated",
    targetType: "role",
    targetId: input.roleId,
    metadata: { name: input.name },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return updated;
}

export async function deleteRole(actor: Actor, roleId: string, meta: RequestMeta) {
  const role = await getRoleById(roleId);
  if (!role) throw new AppError("NOT_FOUND", "Role not found");

  const holders = await countStaffWithRole(roleId);
  if (holders > 0) {
    throw new AppError(
      "CONFLICT",
      `Can't delete this role - ${holders} staff member(s) still hold it. Move them to a ` +
        "different role first.",
    );
  }

  await deleteRoleRow(roleId);

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "role.deleted",
    targetType: "role",
    targetId: roleId,
    metadata: { key: role.key, name: role.name },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

// Full-replace permission assignment for a role. Guards the same lockout
// invariant as wouldLockOutStaffAdmin above, but at the role level: if every
// active holder of a STAFF_ADMIN_PERMISSIONS key reaches it only through
// THIS role, stripping that key here must not succeed either - otherwise
// the per-staff-member guard could be bypassed entirely by editing the
// role's permissions instead of the staff member's role/active state.
export async function setRolePermissions(
  actor: Actor,
  input: SetRolePermissionsInput,
  meta: RequestMeta,
) {
  const role = await getRoleById(input.roleId);
  if (!role) throw new AppError("NOT_FOUND", "Role not found");

  const allPermissions = await listPermissions();
  const keyById = new Map(allPermissions.map((p) => [p.id, p.key] as const));
  const newKeys = new Set(
    input.permissionIds
      .map((id) => keyById.get(id))
      .filter((key): key is string => Boolean(key)),
  );

  // withPermissionLocks - same TOCTOU concern as setStaffMemberActive/
  // changeStaffMemberRole (wouldLeaveNoActiveHolder's comment): without
  // this, a concurrent edit to a DIFFERENT role, or a concurrent
  // deactivate/role-change on a staff member, could each read a safe
  // holder count before either write commits.
  await withPermissionLocks(STAFF_ADMIN_PERMISSIONS, async (tx) => {
    const currentKeys = await getPermissionKeysForRole(input.roleId, tx);
    const activeHoldersOfThisRole = await countActiveStaffWithRole(input.roleId, tx);

    if (activeHoldersOfThisRole > 0) {
      for (const permission of STAFF_ADMIN_PERMISSIONS) {
        const losingIt = currentKeys.has(permission) && !newKeys.has(permission);
        if (!losingIt) continue;

        const totalActiveHolders = await countActiveStaffWithPermission(permission, tx);
        if (totalActiveHolders <= activeHoldersOfThisRole) {
          throw new AppError(
            "CONFLICT",
            `Can't remove "${permission}" from this role - it would leave no active staff member ` +
              "with that permission.",
          );
        }
      }
    }

    await setRolePermissionsRow(input.roleId, input.permissionIds, tx);
  });

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "role.permissions_set",
    targetType: "role",
    targetId: input.roleId,
    metadata: { permissionKeys: [...newKeys] },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}
