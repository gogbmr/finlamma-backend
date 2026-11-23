import { beforeEach, describe, expect, it, vi } from "vitest";

const mockListRoles = vi.fn();
const mockListStaffWithRoles = vi.fn();
const mockSetStaffActive = vi.fn();
const mockUpdateStaffRole = vi.fn();
const mockUpsertStaffMemberFromInvite = vi.fn();
const mockDeactivateStaffMemberByClerkId = vi.fn();
const mockGetRoleById = vi.fn();
const mockGetStaffMemberById = vi.fn();
const mockRoleHasPermission = vi.fn();
const mockCountActiveStaffWithPermission = vi.fn();
const mockCountActiveStaffWithRole = vi.fn();
const mockCountStaffWithRole = vi.fn();
const mockCreateRole = vi.fn();
const mockDeleteRole = vi.fn();
const mockGetPermissionKeysForRole = vi.fn();
const mockListPermissions = vi.fn();
const mockSetRolePermissions = vi.fn();
const mockSetStaffPhotoKey = vi.fn();
const mockUpdateRole = vi.fn();
const mockUpdateStaffProfile = vi.fn();
vi.mock("./repo", () => ({
  listRoles: () => mockListRoles(),
  listStaffWithRoles: () => mockListStaffWithRoles(),
  setStaffActive: (id: unknown, active: unknown) => mockSetStaffActive(id, active),
  updateStaffRole: (id: unknown, roleId: unknown) => mockUpdateStaffRole(id, roleId),
  upsertStaffMemberFromInvite: (input: unknown) => mockUpsertStaffMemberFromInvite(input),
  deactivateStaffMemberByClerkId: (id: unknown) => mockDeactivateStaffMemberByClerkId(id),
  getRoleById: (id: unknown) => mockGetRoleById(id),
  getStaffMemberById: (id: unknown) => mockGetStaffMemberById(id),
  roleHasPermission: (roleId: unknown, permission: unknown) =>
    mockRoleHasPermission(roleId, permission),
  countActiveStaffWithPermission: (permission: unknown) =>
    mockCountActiveStaffWithPermission(permission),
  countActiveStaffWithRole: (roleId: unknown) => mockCountActiveStaffWithRole(roleId),
  countStaffWithRole: (roleId: unknown) => mockCountStaffWithRole(roleId),
  createRole: (input: unknown) => mockCreateRole(input),
  deleteRole: (id: unknown) => mockDeleteRole(id),
  getPermissionKeysForRole: (roleId: unknown) => mockGetPermissionKeysForRole(roleId),
  listPermissions: () => mockListPermissions(),
  setRolePermissions: (roleId: unknown, permissionIds: unknown) =>
    mockSetRolePermissions(roleId, permissionIds),
  setStaffPhotoKey: (id: unknown, photoKey: unknown) => mockSetStaffPhotoKey(id, photoKey),
  updateRole: (id: unknown, input: unknown) => mockUpdateRole(id, input),
  updateStaffProfile: (id: unknown, input: unknown) => mockUpdateStaffProfile(id, input),
  // No real transaction/advisory lock in these unit tests (that needs a
  // real Postgres connection - see repo.test.ts for the integration
  // coverage) - just runs the callback with a dummy tx, since every mocked
  // repo function above ignores whatever extra `tx` argument it's called
  // with anyway.
  withPermissionLocks: (_keys: unknown, fn: (tx: unknown) => unknown) => fn(undefined),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

const mockGetSignedDownloadUrl = vi.fn();
const mockUploadObject = vi.fn();
vi.mock("@/lib/s3", () => ({
  getSignedDownloadUrl: (key: unknown) => mockGetSignedDownloadUrl(key),
  uploadObject: (key: unknown, body: unknown, contentType: unknown) =>
    mockUploadObject(key, body, contentType),
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
  createRole,
  deactivateStaffMemberFromClerkEvent,
  deleteRole,
  getRolesPageData,
  getStaffPageData,
  inviteStaffMember,
  setRolePermissions,
  setStaffMemberActive,
  STAFF_INVITE_ROLE_METADATA_KEY,
  updateRole,
  updateStaffProfile,
  uploadStaffPhoto,
} from "./service";

const ACTOR = { id: "staff-actor-1" };
const ACTOR_WITH_ROLE = { id: "staff-actor-1", roleId: "actor-role" };
const META = { ip: "203.0.113.5", userAgent: "Mozilla/5.0" };

beforeEach(() => {
  mockListRoles.mockReset();
  mockListStaffWithRoles.mockReset();
  mockSetStaffActive.mockReset();
  mockUpdateStaffRole.mockReset();
  mockUpsertStaffMemberFromInvite.mockReset();
  mockCountActiveStaffWithRole.mockReset().mockResolvedValue(0);
  mockCountStaffWithRole.mockReset().mockResolvedValue(0);
  mockCreateRole.mockReset();
  mockDeleteRole.mockReset();
  mockGetPermissionKeysForRole.mockReset().mockResolvedValue(new Set());
  mockListPermissions.mockReset().mockResolvedValue([]);
  mockSetRolePermissions.mockReset();
  mockSetStaffPhotoKey.mockReset();
  mockUpdateRole.mockReset();
  mockUpdateStaffProfile.mockReset();
  mockGetSignedDownloadUrl.mockReset().mockImplementation((key: string) => `https://signed.example/${key}`);
  mockUploadObject.mockReset();
  mockDeactivateStaffMemberByClerkId.mockReset();
  mockLogActivity.mockReset();
  mockCreateInvitation.mockReset();

  mockGetRoleById.mockReset().mockResolvedValue({ id: "role-1", key: "some_role" });
  mockGetStaffMemberById.mockReset().mockResolvedValue({
    id: "s1",
    active: true,
    roleId: "role-current",
  });
  // Default: the target doesn't hold staff.manage, so the lockout guard
  // never engages unless a test explicitly opts in below.
  mockRoleHasPermission.mockReset().mockResolvedValue(false);
  mockCountActiveStaffWithPermission.mockReset().mockResolvedValue(0);
});

describe("getStaffPageData", () => {
  it("returns staff and roles", async () => {
    mockListStaffWithRoles.mockResolvedValueOnce([{ id: "s1", photoKey: null }]);
    mockListRoles.mockResolvedValueOnce([{ id: "r1" }]);

    const result = await getStaffPageData();

    expect(result).toEqual({
      staff: [{ id: "s1", photoKey: null, photoUrl: null }],
      roles: [{ id: "r1" }],
    });
  });

  it("resolves a signed photoUrl for a staff member with a photoKey", async () => {
    mockListStaffWithRoles.mockResolvedValueOnce([{ id: "s1", photoKey: "staff/s1/a.png" }]);
    mockListRoles.mockResolvedValueOnce([]);

    const result = await getStaffPageData();

    expect(result.staff[0]).toMatchObject({ photoUrl: "https://signed.example/staff/s1/a.png" });
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

  it("throws NOT_FOUND and never contacts Clerk when the role id doesn't exist", async () => {
    mockGetRoleById.mockResolvedValueOnce(undefined);

    await expect(
      inviteStaffMember(ACTOR, { email: "new@example.com", roleId: "bogus-role" }, META),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockCreateInvitation).not.toHaveBeenCalled();
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

  it("refuses to deactivate the last active staff.manage holder", async () => {
    mockGetStaffMemberById.mockResolvedValueOnce({
      id: "s1",
      active: true,
      roleId: "role-super-admin",
    });
    mockRoleHasPermission.mockResolvedValueOnce(true); // current role holds staff.manage
    mockCountActiveStaffWithPermission.mockResolvedValueOnce(1); // only this one

    await expect(setStaffMemberActive(ACTOR, "s1", false, META)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(mockSetStaffActive).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("allows deactivating a staff.manage holder when another one is still active", async () => {
    mockGetStaffMemberById.mockResolvedValueOnce({
      id: "s1",
      active: true,
      roleId: "role-super-admin",
    });
    mockRoleHasPermission.mockResolvedValueOnce(true);
    mockCountActiveStaffWithPermission.mockResolvedValueOnce(2); // this one plus another
    mockSetStaffActive.mockResolvedValueOnce({ id: "s1", active: false });
    mockLogActivity.mockResolvedValueOnce(undefined);

    await setStaffMemberActive(ACTOR, "s1", false, META);

    expect(mockSetStaffActive).toHaveBeenCalledWith("s1", false);
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

  it("throws NOT_FOUND when the target role id doesn't exist", async () => {
    mockGetRoleById.mockResolvedValueOnce(undefined);

    await expect(changeStaffMemberRole(ACTOR, "s1", "bogus-role", META)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockUpdateStaffRole).not.toHaveBeenCalled();
  });

  it("refuses a demotion that would leave no active staff.manage holder", async () => {
    mockGetStaffMemberById.mockResolvedValueOnce({
      id: "s1",
      active: true,
      roleId: "role-super-admin",
    });
    // Current role holds staff.manage, the new one doesn't.
    mockRoleHasPermission.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    mockCountActiveStaffWithPermission.mockResolvedValueOnce(1);

    await expect(changeStaffMemberRole(ACTOR, "s1", "role-quiz-maker", META)).rejects.toMatchObject(
      { code: "CONFLICT" },
    );
    expect(mockUpdateStaffRole).not.toHaveBeenCalled();
  });

  it("allows a role change that keeps staff.manage on the target", async () => {
    mockGetStaffMemberById.mockResolvedValueOnce({
      id: "s1",
      active: true,
      roleId: "role-super-admin",
    });
    mockRoleHasPermission.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    mockUpdateStaffRole.mockResolvedValueOnce({ id: "s1", roleId: "role-2" });
    mockLogActivity.mockResolvedValueOnce(undefined);

    await changeStaffMemberRole(ACTOR, "s1", "role-2", META);

    expect(mockUpdateStaffRole).toHaveBeenCalledWith("s1", "role-2");
  });
});

describe("updateStaffProfile", () => {
  const INPUT = { staffId: "s1", gender: "female" as const, phone: "123", address: "addr" };

  it("allows self-edit without checking any permission", async () => {
    mockUpdateStaffProfile.mockResolvedValueOnce({ id: "s1" });
    mockLogActivity.mockResolvedValueOnce(undefined);

    await updateStaffProfile({ id: "s1", roleId: "any-role" }, INPUT, META);

    expect(mockRoleHasPermission).not.toHaveBeenCalled();
    expect(mockUpdateStaffProfile).toHaveBeenCalledWith("s1", {
      gender: "female",
      phone: "123",
      address: "addr",
    });
    expect(mockLogActivity).toHaveBeenCalledWith({
      actorType: "staff",
      actorId: "s1",
      action: "staff.profile_updated",
      targetType: "staff_member",
      targetId: "s1",
      metadata: { self: true },
      ip: "203.0.113.5",
      userAgent: "Mozilla/5.0",
    });
  });

  it("allows editing someone else's profile when the actor holds staff.edit", async () => {
    mockRoleHasPermission.mockResolvedValueOnce(true);
    mockUpdateStaffProfile.mockResolvedValueOnce({ id: "s1" });
    mockLogActivity.mockResolvedValueOnce(undefined);

    await updateStaffProfile(ACTOR_WITH_ROLE, INPUT, META);

    expect(mockRoleHasPermission).toHaveBeenCalledWith("actor-role", "staff.edit");
    expect(mockUpdateStaffProfile).toHaveBeenCalled();
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { self: false } }),
    );
  });

  it("refuses to edit someone else's profile without staff.edit", async () => {
    mockRoleHasPermission.mockResolvedValueOnce(false);

    await expect(updateStaffProfile(ACTOR_WITH_ROLE, INPUT, META)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mockUpdateStaffProfile).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});

describe("uploadStaffPhoto", () => {
  const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

  it("allows uploading your own photo without checking any permission", async () => {
    mockGetStaffMemberById.mockResolvedValueOnce({ id: "s1", photoKey: null });
    mockSetStaffPhotoKey.mockResolvedValueOnce({ id: "s1", photoKey: "staff/s1/new.png" });
    mockLogActivity.mockResolvedValueOnce(undefined);

    await uploadStaffPhoto({ id: "s1", roleId: "any-role" }, "s1", { body: PNG_BYTES }, META);

    expect(mockRoleHasPermission).not.toHaveBeenCalled();
    expect(mockUploadObject).toHaveBeenCalled();
    expect(mockSetStaffPhotoKey).toHaveBeenCalledWith("s1", expect.stringMatching(/^staff\/s1\//));
  });

  it("refuses uploading someone else's photo without staff.edit", async () => {
    mockRoleHasPermission.mockResolvedValueOnce(false);

    await expect(
      uploadStaffPhoto(ACTOR_WITH_ROLE, "s2", { body: PNG_BYTES }, META),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it("rejects an oversized file without uploading", async () => {
    mockGetStaffMemberById.mockResolvedValueOnce({ id: "s1", photoKey: null });
    const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(2 * 1024 * 1024)]);

    await expect(
      uploadStaffPhoto({ id: "s1", roleId: "any-role" }, "s1", { body: oversized }, META),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it("rejects a non-image file without uploading", async () => {
    mockGetStaffMemberById.mockResolvedValueOnce({ id: "s1", photoKey: null });

    await expect(
      uploadStaffPhoto(
        { id: "s1", roleId: "any-role" },
        "s1",
        { body: Buffer.from("not an image") },
        META,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for a staff id that doesn't exist", async () => {
    mockGetStaffMemberById.mockResolvedValueOnce(undefined);

    await expect(
      uploadStaffPhoto({ id: "s1", roleId: "any-role" }, "s1", { body: PNG_BYTES }, META),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("getRolesPageData", () => {
  it("batches every role's granted permission keys into one map", async () => {
    mockListRoles.mockResolvedValueOnce([{ id: "r1" }, { id: "r2" }]);
    mockListPermissions.mockResolvedValueOnce([{ id: "p1", key: "staff.view" }]);
    mockGetPermissionKeysForRole.mockImplementation((roleId: string) =>
      Promise.resolve(roleId === "r1" ? new Set(["staff.view"]) : new Set()),
    );

    const result = await getRolesPageData();

    expect(result.permissionKeysByRoleId.get("r1")).toEqual(new Set(["staff.view"]));
    expect(result.permissionKeysByRoleId.get("r2")).toEqual(new Set());
  });
});

describe("role CRUD", () => {
  it("createRole creates and logs", async () => {
    mockCreateRole.mockResolvedValueOnce({ id: "r1", key: "reviewer", name: "Reviewer" });
    mockLogActivity.mockResolvedValueOnce(undefined);

    const result = await createRole(
      ACTOR,
      { key: "reviewer", name: "Reviewer", description: null },
      META,
    );

    expect(result).toEqual({ id: "r1", key: "reviewer", name: "Reviewer" });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "role.created", targetId: "r1" }),
    );
  });

  it("updateRole updates and logs", async () => {
    mockUpdateRole.mockResolvedValueOnce({ id: "r1", name: "New Name" });
    mockLogActivity.mockResolvedValueOnce(undefined);

    await updateRole(ACTOR, { roleId: "r1", name: "New Name", description: null }, META);

    expect(mockUpdateRole).toHaveBeenCalledWith("r1", { name: "New Name", description: null });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "role.updated", targetId: "r1" }),
    );
  });

  it("deleteRole refuses while staff members still hold the role", async () => {
    mockGetRoleById.mockResolvedValueOnce({ id: "r1", key: "reviewer", name: "Reviewer" });
    mockCountStaffWithRole.mockResolvedValueOnce(2);

    await expect(deleteRole(ACTOR, "r1", META)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockDeleteRole).not.toHaveBeenCalled();
  });

  it("deleteRole deletes and logs once nobody holds it", async () => {
    mockGetRoleById.mockResolvedValueOnce({ id: "r1", key: "reviewer", name: "Reviewer" });
    mockCountStaffWithRole.mockResolvedValueOnce(0);
    mockDeleteRole.mockResolvedValueOnce({ id: "r1", key: "reviewer", name: "Reviewer" });
    mockLogActivity.mockResolvedValueOnce(undefined);

    await deleteRole(ACTOR, "r1", META);

    expect(mockDeleteRole).toHaveBeenCalledWith("r1");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "role.deleted", targetId: "r1" }),
    );
  });

  it("deleteRole throws NOT_FOUND for a role id that doesn't exist", async () => {
    mockGetRoleById.mockResolvedValueOnce(undefined);

    await expect(deleteRole(ACTOR, "bogus", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("setRolePermissions", () => {
  const PERMS = [
    { id: "p-edit", key: "staff.edit" },
    { id: "p-delete", key: "staff.delete" },
    { id: "p-view", key: "staff.view" },
  ];

  it("replaces the role's grants and logs the new key set", async () => {
    mockGetRoleById.mockResolvedValueOnce({ id: "r1" });
    mockListPermissions.mockResolvedValueOnce(PERMS);
    mockCountActiveStaffWithRole.mockResolvedValueOnce(0);
    mockGetPermissionKeysForRole.mockResolvedValueOnce(new Set(["staff.view"]));
    mockLogActivity.mockResolvedValueOnce(undefined);

    await setRolePermissions(ACTOR, { roleId: "r1", permissionIds: ["p-view", "p-edit"] }, META);

    expect(mockSetRolePermissions).toHaveBeenCalledWith("r1", ["p-view", "p-edit"]);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "role.permissions_set",
        targetId: "r1",
        metadata: { permissionKeys: expect.arrayContaining(["staff.view", "staff.edit"]) },
      }),
    );
  });

  it("blocks removing the last active holder's staff.edit via a role-permission edit", async () => {
    mockGetRoleById.mockResolvedValueOnce({ id: "r1" });
    mockListPermissions.mockResolvedValueOnce(PERMS);
    mockGetPermissionKeysForRole.mockResolvedValueOnce(new Set(["staff.edit", "staff.view"]));
    mockCountActiveStaffWithRole.mockResolvedValueOnce(1);
    mockCountActiveStaffWithPermission.mockResolvedValueOnce(1);

    await expect(
      setRolePermissions(ACTOR, { roleId: "r1", permissionIds: ["p-view"] }, META),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockSetRolePermissions).not.toHaveBeenCalled();
  });

  it("allows removing staff.edit when another role still covers it", async () => {
    mockGetRoleById.mockResolvedValueOnce({ id: "r1" });
    mockListPermissions.mockResolvedValueOnce(PERMS);
    mockGetPermissionKeysForRole.mockResolvedValueOnce(new Set(["staff.edit", "staff.view"]));
    mockCountActiveStaffWithRole.mockResolvedValueOnce(1);
    mockCountActiveStaffWithPermission.mockResolvedValueOnce(2);
    mockLogActivity.mockResolvedValueOnce(undefined);

    await setRolePermissions(ACTOR, { roleId: "r1", permissionIds: ["p-view"] }, META);

    expect(mockSetRolePermissions).toHaveBeenCalledWith("r1", ["p-view"]);
  });

  it("throws NOT_FOUND for a role id that doesn't exist", async () => {
    mockGetRoleById.mockResolvedValueOnce(undefined);

    await expect(
      setRolePermissions(ACTOR, { roleId: "bogus", permissionIds: [] }, META),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
