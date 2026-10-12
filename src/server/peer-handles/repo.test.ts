// Integration tests against an in-process PGlite database (src/test/db.ts) -
// random selection (ORDER BY random()) and the FK restrict-on-delete are
// real Postgres behavior worth proving against a real engine, not just a
// mocked unit test. Never touches the real Supabase database (see
// @/db/client's NODE_ENV=test guard).
import { afterAll, describe, expect, it, vi } from "vitest";
import { peerHandles, users } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  deletePeerHandleRow,
  getHandlesForUserIds,
  getPeerHandleByKey,
  getPeerHandleById,
  getUserHandleState,
  insertPeerHandle,
  listActivePeerHandles,
  listPeerHandles,
  listUserIdsWithoutHandle,
  pickRandomActivePeerHandleId,
  setUserHandle,
  setUserHandleAndRerolledAt,
  updatePeerHandleRow,
} = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

let n = 0;
function uniqueHandleKey(label: string) {
  n++;
  return `${label}-${n}`;
}

async function makeHandle(overrides: Partial<{ key: string; active: boolean }> = {}) {
  const [row] = await db
    .insert(peerHandles)
    .values({
      key: overrides.key ?? uniqueHandleKey("handle"),
      name: { en: "Smart Saver", hi: "समझदार बचतकर्ता", hx: "Smart Saver" },
      active: overrides.active ?? true,
    })
    .returning();
  return row;
}

async function makeUser() {
  const [user] = await db
    .insert(users)
    .values({ clerkUserId: uniqueClerkUserId("peer-handles-repo-user"), clerkUpdatedAt: new Date() })
    .returning();
  return user;
}

describe("insertPeerHandle / listPeerHandles / listActivePeerHandles / getPeerHandleById / getPeerHandleByKey", () => {
  it("creates a handle and finds it by id and by key", async () => {
    const key = uniqueHandleKey("lookup");
    const created = await insertPeerHandle({
      key,
      name: { en: "Bright Bull", hi: "तेज़ बैल", hx: "Bright Bull" },
      active: true,
    });

    expect((await getPeerHandleById(created.id))?.key).toBe(key);
    expect((await getPeerHandleByKey(key))?.id).toBe(created.id);
  });

  it("listActivePeerHandles excludes inactive rows that listPeerHandles still includes", async () => {
    const active = await makeHandle({ active: true });
    const inactive = await makeHandle({ active: false });

    const all = await listPeerHandles();
    const activeOnly = await listActivePeerHandles();

    expect(all.some((h) => h.id === active.id)).toBe(true);
    expect(all.some((h) => h.id === inactive.id)).toBe(true);
    expect(activeOnly.some((h) => h.id === active.id)).toBe(true);
    expect(activeOnly.some((h) => h.id === inactive.id)).toBe(false);
  });
});

describe("updatePeerHandleRow / deletePeerHandleRow", () => {
  it("updates name/active and returns null for a handle that doesn't exist", async () => {
    const handle = await makeHandle();

    const updated = await updatePeerHandleRow(handle.id, {
      name: { en: "Updated", hi: "x", hx: "x" },
      active: false,
    });
    expect(updated?.active).toBe(false);

    expect(await updatePeerHandleRow("00000000-0000-4000-8000-000000000000", {
      name: { en: "x", hi: "x", hx: "x" },
      active: true,
    })).toBeNull();
  });

  it("deletes an unassigned handle, and returns null deleting one that doesn't exist", async () => {
    const handle = await makeHandle();
    const deleted = await deletePeerHandleRow(handle.id);
    expect(deleted?.id).toBe(handle.id);
    expect(await getPeerHandleById(handle.id)).toBeNull();

    expect(await deletePeerHandleRow("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("fails with a foreign key violation when deleting a handle still assigned to a user", async () => {
    const handle = await makeHandle();
    const user = await makeUser();
    await setUserHandle(user.id, handle.id);

    await expect(deletePeerHandleRow(handle.id)).rejects.toThrow();
  });
});

describe("pickRandomActivePeerHandleId", () => {
  it("returns null when no active handle exists at all", async () => {
    await makeHandle({ active: false });
    // Deactivate every handle this PGlite instance has accumulated so far,
    // so this test is never flaky depending on run order/leftover rows.
    await db.update(peerHandles).set({ active: false });

    expect(await pickRandomActivePeerHandleId()).toBeNull();
  });

  it("picks an active handle, excluding the given id when another active one exists", async () => {
    await db.update(peerHandles).set({ active: false });
    const a = await makeHandle({ active: true });
    const b = await makeHandle({ active: true });

    for (let i = 0; i < 10; i++) {
      const picked = await pickRandomActivePeerHandleId(a.id);
      expect(picked).toBe(b.id);
    }
  });

  it("falls back to the excluded id when it's the only active handle left", async () => {
    await db.update(peerHandles).set({ active: false });
    const only = await makeHandle({ active: true });

    expect(await pickRandomActivePeerHandleId(only.id)).toBe(only.id);
  });
});

describe("setUserHandle / setUserHandleAndRerolledAt / getUserHandleState", () => {
  it("sets a handle without touching handleRerolledAt", async () => {
    const user = await makeUser();
    const handle = await makeHandle();

    await setUserHandle(user.id, handle.id);

    const state = await getUserHandleState(user.id);
    expect(state?.handleId).toBe(handle.id);
    expect(state?.handleRerolledAt).toBeNull();
  });

  it("setUserHandleAndRerolledAt sets both fields together", async () => {
    const user = await makeUser();
    const handle = await makeHandle();

    await setUserHandleAndRerolledAt(user.id, handle.id);

    const state = await getUserHandleState(user.id);
    expect(state?.handleId).toBe(handle.id);
    expect(state?.handleRerolledAt).not.toBeNull();
  });
});

describe("listUserIdsWithoutHandle", () => {
  it("lists only users with no handle assigned yet", async () => {
    const withHandle = await makeUser();
    const withoutHandle = await makeUser();
    const handle = await makeHandle();
    await setUserHandle(withHandle.id, handle.id);

    const ids = await listUserIdsWithoutHandle();

    expect(ids).toContain(withoutHandle.id);
    expect(ids).not.toContain(withHandle.id);
  });
});

describe("getHandlesForUserIds", () => {
  it("returns an empty map for an empty input, without querying", async () => {
    expect(await getHandlesForUserIds([])).toEqual(new Map());
  });

  it("maps each user id to their handle's full LocalizedText, or null if unassigned", async () => {
    const withHandle = await makeUser();
    const withoutHandle = await makeUser();
    const handle = await makeHandle();
    await setUserHandle(withHandle.id, handle.id);

    const map = await getHandlesForUserIds([withHandle.id, withoutHandle.id]);

    expect(map.get(withHandle.id)).toEqual(handle.name);
    expect(map.get(withoutHandle.id)).toBeNull();
  });
});
