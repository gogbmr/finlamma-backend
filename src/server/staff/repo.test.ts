// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves getPermissionKeysForRole's single query actually
// returns the right set against a real join, the way it's now relied on by
// the admin shell (src/app/admin/(dashboard)/layout.tsx) instead of 22
// separate roleHasPermission() round trips - see docs/ARCHITECTURE.md D72.
// Never touches the real Supabase database (see @/db/client's NODE_ENV=test
// guard).
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { permissions, rolePermissions, roles, staffMembers } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  countActiveStaffWithRole,
  countStaffWithRole,
  createRole,
  deleteRole,
  getPermissionKeysForRole,
  listPermissions,
  roleHasPermission,
  setRolePermissions,
  setStaffPhotoKey,
  updateRole,
  updateStaffProfile,
  upsertStaffMemberFromInvite,
  withPermissionLocks,
} = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

async function makeRole(key: string) {
  const [role] = await db.insert(roles).values({ key, name: key }).returning();
  return role;
}

async function makePermission(key: string) {
  const [permission] = await db.insert(permissions).values({ key }).returning();
  return permission;
}

async function grant(roleId: string, permissionId: string) {
  await db.insert(rolePermissions).values({ roleId, permissionId });
}

describe("getPermissionKeysForRole", () => {
  it("returns exactly the permission keys granted to the role, in one query", async () => {
    const role = await makeRole("getPermissionKeysForRole-role-a");
    const worldManage = await makePermission(
      "getPermissionKeysForRole-world.manage",
    );
    const worldPublish = await makePermission(
      "getPermissionKeysForRole-world.publish",
    );
    await grant(role.id, worldManage.id);
    await grant(role.id, worldPublish.id);

    const keys = await getPermissionKeysForRole(role.id);

    expect(keys).toEqual(
      new Set([
        "getPermissionKeysForRole-world.manage",
        "getPermissionKeysForRole-world.publish",
      ]),
    );
  });

  it("returns an empty set for a role with no permissions granted", async () => {
    const role = await makeRole("getPermissionKeysForRole-role-empty");
    expect(await getPermissionKeysForRole(role.id)).toEqual(new Set());
  });

  it("never includes another role's permissions", async () => {
    const roleA = await makeRole("getPermissionKeysForRole-role-b");
    const roleB = await makeRole("getPermissionKeysForRole-role-c");
    const onlyForB = await makePermission(
      "getPermissionKeysForRole-only-for-b",
    );
    await grant(roleB.id, onlyForB.id);

    expect(await getPermissionKeysForRole(roleA.id)).toEqual(new Set());
    expect(await getPermissionKeysForRole(roleB.id)).toEqual(
      new Set(["getPermissionKeysForRole-only-for-b"]),
    );
  });

  it("agrees with roleHasPermission for the same role/permission pairs", async () => {
    const role = await makeRole("getPermissionKeysForRole-role-d");
    const granted = await makePermission("getPermissionKeysForRole-granted");
    await grant(role.id, granted.id);
    // "not-granted" deliberately has no permissions row at all - both
    // functions should treat "never existed" and "exists but ungranted"
    // identically (neither row for this key ever appears in the join).

    const keys = await getPermissionKeysForRole(role.id);

    expect(keys.has("getPermissionKeysForRole-granted")).toBe(
      await roleHasPermission(role.id, "getPermissionKeysForRole-granted"),
    );
    expect(keys.has("getPermissionKeysForRole-not-granted")).toBe(
      await roleHasPermission(role.id, "getPermissionKeysForRole-not-granted"),
    );
  });
});

async function makeStaff(roleId: string, overrides: Partial<{ email: string }> = {}) {
  const [staff] = await db
    .insert(staffMembers)
    .values({ clerkUserId: uniqueClerkUserId("staff-repo-test"), roleId, ...overrides })
    .returning();
  return staff!;
}

describe("updateStaffProfile", () => {
  it("sets gender/phone/address and leaves email/role untouched", async () => {
    const role = await makeRole("updateStaffProfile-role");
    const staff = await makeStaff(role.id, { email: "kept@example.com" });

    const updated = await updateStaffProfile(staff.id, {
      gender: "female",
      phone: "9999999999",
      address: "221B Baker Street",
    });

    expect(updated.gender).toBe("female");
    expect(updated.phone).toBe("9999999999");
    expect(updated.address).toBe("221B Baker Street");
    expect(updated.email).toBe("kept@example.com");
    expect(updated.roleId).toBe(role.id);
  });

  it("clears a field back to null when explicitly passed null", async () => {
    const role = await makeRole("updateStaffProfile-clear-role");
    const staff = await makeStaff(role.id);
    await updateStaffProfile(staff.id, { phone: "123" });

    const cleared = await updateStaffProfile(staff.id, { phone: null });

    expect(cleared.phone).toBeNull();
  });

  it("throws NOT_FOUND for a staff id that doesn't exist", async () => {
    await expect(
      updateStaffProfile("00000000-0000-4000-8000-000000000000", { phone: "1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("setStaffPhotoKey", () => {
  it("sets the photo key and returns the updated row", async () => {
    const role = await makeRole("setStaffPhotoKey-role");
    const staff = await makeStaff(role.id);

    const updated = await setStaffPhotoKey(staff.id, "staff/some-id/abc.png");

    expect(updated.photoKey).toBe("staff/some-id/abc.png");
  });
});

describe("upsertStaffMemberFromInvite - email handling", () => {
  it("stores the email on first insert", async () => {
    const role = await makeRole("upsert-email-role-a");
    const clerkUserId = uniqueClerkUserId("upsert-email");

    const row = await upsertStaffMemberFromInvite({
      clerkUserId,
      roleId: role.id,
      email: "first@example.com",
    });

    expect(row.email).toBe("first@example.com");
  });

  it("never overwrites an existing email with a blank on re-invite", async () => {
    const role = await makeRole("upsert-email-role-b");
    const clerkUserId = uniqueClerkUserId("upsert-email-reinvite");
    await upsertStaffMemberFromInvite({ clerkUserId, roleId: role.id, email: "original@example.com" });

    const reinvited = await upsertStaffMemberFromInvite({ clerkUserId, roleId: role.id });

    expect(reinvited.email).toBe("original@example.com");
  });

  it("updates the email when the re-invite carries a new one", async () => {
    const role = await makeRole("upsert-email-role-c");
    const clerkUserId = uniqueClerkUserId("upsert-email-changed");
    await upsertStaffMemberFromInvite({ clerkUserId, roleId: role.id, email: "old@example.com" });

    const reinvited = await upsertStaffMemberFromInvite({
      clerkUserId,
      roleId: role.id,
      email: "new@example.com",
    });

    expect(reinvited.email).toBe("new@example.com");
  });
});

describe("role CRUD", () => {
  it("createRole creates a role with the given key/name/description", async () => {
    const key = `created-role-${Date.now()}`;
    const role = await createRole({ key, name: "Created Role", description: "d" });

    expect(role.key).toBe(key);
    expect(role.name).toBe("Created Role");
    expect(role.description).toBe("d");
  });

  it("updateRole changes name/description without touching key", async () => {
    const role = await makeRole("updateRole-role");

    const updated = await updateRole(role.id, { name: "New Name", description: "new desc" });

    expect(updated.name).toBe("New Name");
    expect(updated.description).toBe("new desc");
    expect(updated.key).toBe(role.key);
  });

  it("updateRole throws NOT_FOUND for a role id that doesn't exist", async () => {
    await expect(
      updateRole("00000000-0000-4000-8000-000000000000", { name: "x" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deleteRole removes the role and returns the deleted row", async () => {
    const role = await makeRole("deleteRole-role");

    const deleted = await deleteRole(role.id);

    expect(deleted?.id).toBe(role.id);
  });

  it("deleteRole returns null for a role id that doesn't exist", async () => {
    expect(await deleteRole("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("countStaffWithRole / countActiveStaffWithRole", () => {
  it("counts active and inactive staff, but countActiveStaffWithRole excludes inactive", async () => {
    const role = await makeRole("countStaffWithRole-role");
    await makeStaff(role.id);
    const [inactiveStaff] = await db
      .insert(staffMembers)
      .values({ clerkUserId: uniqueClerkUserId("count-inactive"), roleId: role.id, active: false })
      .returning();
    expect(inactiveStaff).toBeDefined();

    expect(await countStaffWithRole(role.id)).toBe(2);
    expect(await countActiveStaffWithRole(role.id)).toBe(1);
  });

  it("returns 0 for a role nobody holds", async () => {
    const role = await makeRole("countStaffWithRole-empty-role");
    expect(await countStaffWithRole(role.id)).toBe(0);
    expect(await countActiveStaffWithRole(role.id)).toBe(0);
  });
});

describe("listPermissions", () => {
  it("includes a permission seeded earlier in this file", async () => {
    const key = `listPermissions-${Date.now()}`;
    await db.insert(permissions).values({ key });

    const all = await listPermissions();

    expect(all.some((p) => p.key === key)).toBe(true);
  });
});

describe("setRolePermissions", () => {
  it("replaces a role's grants with exactly the given set", async () => {
    const role = await makeRole("setRolePermissions-role");
    const permA = await makePermission("setRolePermissions-a");
    const permB = await makePermission("setRolePermissions-b");
    await grant(role.id, permA.id);

    await setRolePermissions(role.id, [permB.id]);

    const keys = await getPermissionKeysForRole(role.id);
    expect(keys).toEqual(new Set(["setRolePermissions-b"]));
  });

  it("clears every grant when given an empty array", async () => {
    const role = await makeRole("setRolePermissions-clear-role");
    const perm = await makePermission("setRolePermissions-clear");
    await grant(role.id, perm.id);

    await setRolePermissions(role.id, []);

    expect(await getPermissionKeysForRole(role.id)).toEqual(new Set());
  });

  it("setRolePermissions still works when called with an explicit tx (nested inside withPermissionLocks)", async () => {
    const role = await makeRole("setRolePermissions-tx-role");
    const perm = await makePermission("setRolePermissions-tx");

    await withPermissionLocks(["setRolePermissions-tx"], async (tx) => {
      await setRolePermissions(role.id, [perm.id], tx);
    });

    expect(await getPermissionKeysForRole(role.id)).toEqual(
      new Set(["setRolePermissions-tx"]),
    );
  });
});

// Closes the TOCTOU race a security-auditor pass flagged in the
// admin-lockout guard (src/server/staff/service.ts) - these tests can't
// exercise genuine cross-connection lock contention (PGlite is a single,
// in-process connection - there is no second real session to race against,
// unlike production's pooled connections), so they instead verify the
// mechanics withPermissionLocks actually depends on: the lock call
// succeeds against real Postgres, the wrapped work runs inside a real
// transaction (rolling back entirely on error, never leaving a partial
// write), and its return value passes through. The lock semantics
// themselves (pg_advisory_xact_lock blocks a second session trying to
// acquire the same key, releases automatically on commit/rollback) are
// standard, well-documented Postgres behavior - this test's job is to
// confirm this code calls it correctly, not to re-prove Postgres itself.
describe("withPermissionLocks", () => {
  it("runs the callback and returns its result", async () => {
    const result = await withPermissionLocks(["withPermissionLocks-a"], async () => 42);
    expect(result).toBe(42);
  });

  it("acquires locks for multiple keys without error, regardless of input order", async () => {
    const roleA = await makeRole("withPermissionLocks-multi-a");
    const roleB = await makeRole("withPermissionLocks-multi-b");

    // PGlite is a single, in-process connection - a bare `db.query()` call
    // while a `tx` from this same instance is still open would wait on a
    // connection slot that's already held by this very transaction, and
    // hang forever. Every write inside the callback must go through `tx`.
    await withPermissionLocks(["withPermissionLocks-z", "withPermissionLocks-a"], async (tx) => {
      await tx.update(roles).set({ name: "A renamed" }).where(eq(roles.id, roleA.id));
      await tx.update(roles).set({ name: "B renamed" }).where(eq(roles.id, roleB.id));
    });

    const [refetchedA] = await db.select().from(roles).where(eq(roles.id, roleA.id));
    expect(refetchedA?.name).toBe("A renamed");
  });

  it("rolls back every write inside the callback if it throws", async () => {
    const role = await makeRole("withPermissionLocks-rollback-role");

    await expect(
      withPermissionLocks(["withPermissionLocks-rollback"], async (tx) => {
        await tx.update(roles).set({ name: "should not stick" }).where(eq(roles.id, role.id));
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const [refetched] = await db.select().from(roles).where(eq(roles.id, role.id));
    expect(refetched?.name).toBe(role.name);
  });
});
