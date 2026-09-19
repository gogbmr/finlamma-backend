import { describe, expect, it, vi } from "vitest";

const mockCreateStaffMember = vi.fn();
const mockListRoles = vi.fn();
const mockListStaffWithRoles = vi.fn();
const mockSetStaffActive = vi.fn();
const mockUpdateStaffRole = vi.fn();
vi.mock("./repo", () => ({
  createStaffMember: (input: unknown) => mockCreateStaffMember(input),
  listRoles: () => mockListRoles(),
  listStaffWithRoles: () => mockListStaffWithRoles(),
  setStaffActive: (id: unknown, active: unknown) => mockSetStaffActive(id, active),
  updateStaffRole: (id: unknown, roleId: unknown) => mockUpdateStaffRole(id, roleId),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

import {
  addStaffMember,
  changeStaffMemberRole,
  getStaffPageData,
  setStaffMemberActive,
} from "./service";

const ACTOR = { id: "staff-actor-1" };

describe("getStaffPageData", () => {
  it("returns staff and roles fetched sequentially (not Promise.all)", async () => {
    mockListStaffWithRoles.mockResolvedValueOnce([{ id: "s1" }]);
    mockListRoles.mockResolvedValueOnce([{ id: "r1" }]);

    const result = await getStaffPageData();

    expect(result).toEqual({ staff: [{ id: "s1" }], roles: [{ id: "r1" }] });
  });
});

describe("addStaffMember", () => {
  it("creates the staff member and logs it under the actor, not the target", async () => {
    mockCreateStaffMember.mockResolvedValueOnce({ id: "new-staff-1" });
    mockLogActivity.mockResolvedValueOnce(undefined);

    const input = { clerkUserId: "clerk_new", roleId: "role-1" };
    const result = await addStaffMember(ACTOR, input);

    expect(mockCreateStaffMember).toHaveBeenCalledWith(input);
    expect(mockLogActivity).toHaveBeenCalledWith({
      actorType: "staff",
      actorId: "staff-actor-1",
      action: "staff.created",
      targetType: "staff_member",
      targetId: "new-staff-1",
      metadata: { clerkUserId: "clerk_new", roleId: "role-1" },
    });
    expect(result).toEqual({ id: "new-staff-1" });
  });
});

describe("setStaffMemberActive", () => {
  it("logs staff.deactivated when turning a staff member off", async () => {
    mockSetStaffActive.mockResolvedValueOnce({ id: "s1", active: false });
    mockLogActivity.mockResolvedValueOnce(undefined);

    await setStaffMemberActive(ACTOR, "s1", false);

    expect(mockSetStaffActive).toHaveBeenCalledWith("s1", false);
    expect(mockLogActivity).toHaveBeenCalledWith({
      actorType: "staff",
      actorId: "staff-actor-1",
      action: "staff.deactivated",
      targetType: "staff_member",
      targetId: "s1",
    });
  });

  it("logs staff.activated when turning a staff member on", async () => {
    mockSetStaffActive.mockResolvedValueOnce({ id: "s1", active: true });
    mockLogActivity.mockResolvedValueOnce(undefined);

    await setStaffMemberActive(ACTOR, "s1", true);

    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "staff.activated" }),
    );
  });
});

describe("changeStaffMemberRole", () => {
  it("updates the role and logs the new role id", async () => {
    mockUpdateStaffRole.mockResolvedValueOnce({ id: "s1", roleId: "role-2" });
    mockLogActivity.mockResolvedValueOnce(undefined);

    await changeStaffMemberRole(ACTOR, "s1", "role-2");

    expect(mockUpdateStaffRole).toHaveBeenCalledWith("s1", "role-2");
    expect(mockLogActivity).toHaveBeenCalledWith({
      actorType: "staff",
      actorId: "staff-actor-1",
      action: "staff.role_changed",
      targetType: "staff_member",
      targetId: "s1",
      metadata: { roleId: "role-2" },
    });
  });
});
