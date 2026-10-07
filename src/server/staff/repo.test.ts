// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves getPermissionKeysForRole's single query actually
// returns the right set against a real join, the way it's now relied on by
// the admin shell (src/app/admin/(dashboard)/layout.tsx) instead of 22
// separate roleHasPermission() round trips - see docs/ARCHITECTURE.md D72.
// Never touches the real Supabase database (see @/db/client's NODE_ENV=test
// guard).
import { afterAll, describe, expect, it, vi } from "vitest";
import { permissions, rolePermissions, roles } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const { getPermissionKeysForRole, roleHasPermission } = await import("./repo");
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
