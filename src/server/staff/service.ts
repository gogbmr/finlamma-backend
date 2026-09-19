import { clerkClient } from "@clerk/nextjs/server";
import { logActivity } from "@/lib/activity-log";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import type { InviteStaffMemberInput } from "./schemas";
import {
  countActiveStaffWithPermission,
  deactivateStaffMemberByClerkId,
  getRoleById,
  getStaffMemberById,
  listRoles,
  listStaffWithRoles,
  roleHasPermission,
  setStaffActive,
  updateStaffRole,
  upsertStaffMemberFromInvite,
} from "./repo";

// `actor` is the staff_members row of whoever is performing the action
// (from requireStaff("staff.manage") in the caller), used as the activity
// log actorId - never the target being changed.
type Actor = { id: string };
type RequestMeta = ReturnType<typeof requestMeta>;

// The one permission that can manage staff at all - guarded below so no
// combination of deactivate/role-change actions can ever leave zero active
// staff members able to grant it back. Permission-driven (not hardcoded to
// "super_admin") since roles are meant to be extensible - see requireStaff()
// in src/lib/auth.ts.
const STAFF_MANAGE_PERMISSION = "staff.manage";

// True if applying `newState` to `staffId` would leave no active staff
// member holding `permission` - e.g. deactivating or demoting the only
// active super_admin. Only ever true when the target row itself currently
// holds the permission and wouldn't after the change; a target that never
// held it, or still holds it after, is never blocked.
async function wouldLeaveNoActiveHolder(
  staffId: string,
  permission: string,
  newState: { active: boolean; roleId?: string },
): Promise<boolean> {
  const current = await getStaffMemberById(staffId);
  if (!current) return false; // let the update itself 404

  const currentlyHolds = current.active && (await roleHasPermission(current.roleId, permission));
  if (!currentlyHolds) return false;

  const roleIdAfterChange = newState.roleId ?? current.roleId;
  const stillHolds = newState.active && (await roleHasPermission(roleIdAfterChange, permission));
  if (stillHolds) return false;

  const totalActiveHolders = await countActiveStaffWithPermission(permission);
  return totalActiveHolders <= 1;
}

// Public metadata key on the Clerk invitation, which Clerk copies onto the
// resulting User's own publicMetadata once they accept and sign up (see
// Clerk's docs on invitation metadata) - this is how the STAFF app's
// user.created webhook (src/app/api/webhooks/clerk-staff/route.ts) knows
// which role to create the staff_members row with, without us ever storing
// a separate "pending invite" row of our own.
export const STAFF_INVITE_ROLE_METADATA_KEY = "finlammaStaffRoleId";

export async function getStaffPageData() {
  const [staff, roles] = await Promise.all([listStaffWithRoles(), listRoles()]);
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
) {
  const roleId = publicMetadata[STAFF_INVITE_ROLE_METADATA_KEY];
  if (typeof roleId !== "string") return;

  const staff = await upsertStaffMemberFromInvite({ clerkUserId, roleId });

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
// not just staff.manage-driven deactivation. No-op if they were never staff.
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
  if (!active) {
    const wouldLockOut = await wouldLeaveNoActiveHolder(staffId, STAFF_MANAGE_PERMISSION, {
      active: false,
    });
    if (wouldLockOut) {
      throw new AppError(
        "CONFLICT",
        `Can't deactivate the last active staff member with "${STAFF_MANAGE_PERMISSION}" - ` +
          "give someone else that permission first.",
      );
    }
  }

  const updated = await setStaffActive(staffId, active);

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

  const wouldLockOut = await wouldLeaveNoActiveHolder(staffId, STAFF_MANAGE_PERMISSION, {
    active: true,
    roleId,
  });
  if (wouldLockOut) {
    throw new AppError(
      "CONFLICT",
      `Can't change this staff member's role - it would leave no active staff member with ` +
        `"${STAFF_MANAGE_PERMISSION}".`,
    );
  }

  const updated = await updateStaffRole(staffId, roleId);

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
