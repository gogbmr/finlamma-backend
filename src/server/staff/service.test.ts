import { beforeEach, describe, expect, it, vi } from "vitest";

const mockListRoles = vi.fn();
const mockListStaffWithRoles = vi.fn();
const mockSetStaffActive = vi.fn();
const mockUpdateStaffRole = vi.fn();
const mockUpsertStaffMemberFromInvite = vi.fn();
const mockDeactivateStaffMemberByClerkId = vi.fn();
vi.mock("./repo", () => ({
  listRoles: () => mockListRoles(),
  listStaffWithRoles: () => mockListStaffWithRoles(),
  setStaffActive: (id: unknown, active: unknown) => mockSetStaffActive(id, active),
  updateStaffRole: (id: unknown, roleId: unknown) => mockUpdateStaffRole(id, roleId),
  upsertStaffMemberFromInvite: (input: unknown) => mockUpsertStaffMemberFromInvite(input),
  deactivateStaffMemberByClerkId: (id: unknown) => mockDeactivateStaffMemberByClerkId(id),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

const mockEnv = vi.hoisted(() => ({ APP_URL: "https://admin.finlamma.example" }));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const mockCreateInvitation = vi.fn();
const mockClerkClient = vi.fn(async () => ({
  invitations: { createInvitation: (input: unknown) => mockCreateInvitation(input) },
}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: () => mockClerkClient() }));

import {
  changeStaffMemberRole,
  completeStaffInviteFromClerkEvent,
  deactivateStaffMemberFromClerkEvent,
  getStaffPageData,
  inviteStaffMember,
  setStaffMemberActive,
  STAFF_INVITE_ROLE_METADATA_KEY,
} from "./service";

const ACTOR = { id: "staff-actor-1" };
const META = { ip: "203.0.113.5", userAgent: "Mozilla/5.0" };

beforeEach(() => {
  mockListRoles.mockReset();
  mockListStaffWithRoles.mockReset();
  mockSetStaffActive.mockReset();
  mockUpdateStaffRole.mockReset();
  mockUpsertStaffMemberFromInvite.mockReset();
  mockDeactivateStaffMemberByClerkId.mockReset();
  mockLogActivity.mockReset();
  mockCreateInvitation.mockReset();
});

describe("getStaffPageData", () => {
  it("returns staff and roles", async () => {
    mockListStaffWithRoles.mockResolvedValueOnce([{ id: "s1" }]);
    mockListRoles.mockResolvedValueOnce([{ id: "r1" }]);

    const result = await getStaffPageData();

    expect(result).toEqual({ staff: [{ id: "s1" }], roles: [{ id: "r1" }] });
  });
});

describe("inviteStaffMember", () => {
  it("creates a Clerk invitation with the role id in public metadata and logs it", async () => {
    mockCreateInvitation.mockResolvedValueOnce({ id: "inv_1" });
    mockLogActivity.mockResolvedValueOnce(undefined);

    const result = await inviteStaffMember(
      ACTOR,
      { email: "new@example.com", roleId: "role-1" },
      META,
    );

    expect(mockCreateInvitation).toHaveBeenCalledWith({
      emailAddress: "new@example.com",
      redirectUrl: "https://admin.finlamma.example/admin/sign-in",
      publicMetadata: { [STAFF_INVITE_ROLE_METADATA_KEY]: "role-1" },
    });
    expect(mockLogActivity).toHaveBeenCalledWith({
      actorType: "staff",
      actorId: "staff-actor-1",
      action: "staff.invited",
      targetType: "staff_invitation",
      targetId: "inv_1",
      metadata: { email: "new@example.com", roleId: "role-1" },
      ip: "203.0.113.5",
      userAgent: "Mozilla/5.0",
    });
    expect(result).toEqual({ id: "inv_1" });
  });

  it("throws SERVICE_UNAVAILABLE (without leaking the raw error) if Clerk fails", async () => {
    mockCreateInvitation.mockRejectedValueOnce(new Error("Clerk API down"));

    await expect(
      inviteStaffMember(ACTOR, { email: "new@example.com", roleId: "role-1" }, META),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});

describe("completeStaffInviteFromClerkEvent", () => {
  it("creates the staff_members row and logs it when the role id is present", async () => {
    mockUpsertStaffMemberFromInvite.mockResolvedValueOnce({ id: "s1" });
    mockLogActivity.mockResolvedValueOnce(undefined);

    await completeStaffInviteFromClerkEvent("clerk_new", {
      [STAFF_INVITE_ROLE_METADATA_KEY]: "role-1",
    });

    expect(mockUpsertStaffMemberFromInvite).toHaveBeenCalledWith({
      clerkUserId: "clerk_new",
      roleId: "role-1",
    });
    expect(mockLogActivity).toHaveBeenCalledWith({
      actorType: "system",
      action: "staff.joined_via_invite",
      targetType: "staff_member",
      targetId: "s1",
      metadata: { clerkUserId: "clerk_new", roleId: "role-1" },
    });
  });

  it("is a no-op for a signup with no staff role in public metadata", async () => {
    await completeStaffInviteFromClerkEvent("clerk_random_signup", {});

    expect(mockUpsertStaffMemberFromInvite).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});

describe("deactivateStaffMemberFromClerkEvent", () => {
  it("deactivates and logs when the clerk id matched a staff member", async () => {
    mockDeactivateStaffMemberByClerkId.mockResolvedValueOnce({ id: "s1" });
    mockLogActivity.mockResolvedValueOnce(undefined);

    await deactivateStaffMemberFromClerkEvent("clerk_1");

    expect(mockLogActivity).toHaveBeenCalledWith({
      actorType: "system",
      action: "staff.deactivated_from_clerk",
      targetType: "staff_member",
      targetId: "s1",
      metadata: { clerkUserId: "clerk_1" },
    });
  });

  it("is a no-op when the deleted Clerk user was never staff", async () => {
    mockDeactivateStaffMemberByClerkId.mockResolvedValueOnce(undefined);

    await deactivateStaffMemberFromClerkEvent("clerk_never_staff");

    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});

describe("setStaffMemberActive", () => {
  it("logs staff.deactivated when turning a staff member off", async () => {
    mockSetStaffActive.mockResolvedValueOnce({ id: "s1", active: false });
    mockLogActivity.mockResolvedValueOnce(undefined);

    await setStaffMemberActive(ACTOR, "s1", false, META);

    expect(mockSetStaffActive).toHaveBeenCalledWith("s1", false);
    expect(mockLogActivity).toHaveBeenCalledWith({
      actorType: "staff",
      actorId: "staff-actor-1",
      action: "staff.deactivated",
      targetType: "staff_member",
      targetId: "s1",
      ip: "203.0.113.5",
      userAgent: "Mozilla/5.0",
    });
  });

  it("logs staff.activated when turning a staff member on", async () => {
    mockSetStaffActive.mockResolvedValueOnce({ id: "s1", active: true });
    mockLogActivity.mockResolvedValueOnce(undefined);

    await setStaffMemberActive(ACTOR, "s1", true, META);

    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "staff.activated" }),
    );
  });
});

describe("changeStaffMemberRole", () => {
  it("updates the role and logs the new role id", async () => {
    mockUpdateStaffRole.mockResolvedValueOnce({ id: "s1", roleId: "role-2" });
    mockLogActivity.mockResolvedValueOnce(undefined);

    await changeStaffMemberRole(ACTOR, "s1", "role-2", META);

    expect(mockUpdateStaffRole).toHaveBeenCalledWith("s1", "role-2");
    expect(mockLogActivity).toHaveBeenCalledWith({
      actorType: "staff",
      actorId: "staff-actor-1",
      action: "staff.role_changed",
      targetType: "staff_member",
      targetId: "s1",
      metadata: { roleId: "role-2" },
      ip: "203.0.113.5",
      userAgent: "Mozilla/5.0",
    });
  });
});
