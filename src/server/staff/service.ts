import { clerkClient } from "@clerk/nextjs/server";
import { logActivity } from "@/lib/activity-log";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import type { InviteStaffMemberInput } from "./schemas";
import {
  deactivateStaffMemberByClerkId,
  listRoles,
  listStaffWithRoles,
  setStaffActive,
  updateStaffRole,
  upsertStaffMemberFromInvite,
} from "./repo";

// `actor` is the staff_members row of whoever is performing the action
// (from requireStaff("staff.manage") in the caller), used as the activity
// log actorId - never the target being changed.
type Actor = { id: string };
type RequestMeta = ReturnType<typeof requestMeta>;

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
