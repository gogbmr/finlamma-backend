import { logActivity } from "@/lib/activity-log";
import type { CreateStaffMemberInput } from "./schemas";
import {
  createStaffMember,
  listRoles,
  listStaffWithRoles,
  setStaffActive,
  updateStaffRole,
} from "./repo";

// `actor` is the staff_members row of whoever is performing the action
// (from requireStaff("staff.manage") in the caller), used as the activity
// log actorId - never the target being changed.
type Actor = { id: string };

export async function getStaffPageData() {
  const [staff, roles] = await Promise.all([listStaffWithRoles(), listRoles()]);
  return { staff, roles };
}

export async function addStaffMember(actor: Actor, input: CreateStaffMemberInput) {
  const created = await createStaffMember(input);

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "staff.created",
    targetType: "staff_member",
    targetId: created.id,
    metadata: { clerkUserId: input.clerkUserId, roleId: input.roleId },
  });

  return created;
}

export async function setStaffMemberActive(actor: Actor, staffId: string, active: boolean) {
  const updated = await setStaffActive(staffId, active);

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: active ? "staff.activated" : "staff.deactivated",
    targetType: "staff_member",
    targetId: staffId,
  });

  return updated;
}

export async function changeStaffMemberRole(actor: Actor, staffId: string, roleId: string) {
  const updated = await updateStaffRole(staffId, roleId);

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "staff.role_changed",
    targetType: "staff_member",
    targetId: staffId,
    metadata: { roleId },
  });

  return updated;
}
