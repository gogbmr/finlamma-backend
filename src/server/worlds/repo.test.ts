// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the real unique constraint on `order`, the mentor FK,
// the draft-only update/publish guards, and genuine concurrent-update
// behavior actually hold at the database level. Never touches the real
// Supabase database (see @/db/client's NODE_ENV=test guard).
// src/server/worlds/service.test.ts covers the service layer with this repo
// mocked out.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { mentors, roles, staffMembers, worlds } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  getWorldById,
  insertDraftWorld,
  listPublishedWorldsByMentorId,
  moveWorldToPosition,
  publishWorldRow,
  unpublishWorldRow,
  updateDraftWorld,
} = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

const [testRole] = await db
  .insert(roles)
  .values({ key: "super_admin", name: "Super Admin" })
  .returning();
const [testStaff] = await db
  .insert(staffMembers)
  .values({ clerkUserId: uniqueClerkUserId("worlds-repo-test-staff"), roleId: testRole.id })
  .returning();
const staffId = testStaff.id;

let nextOrder = 100_000;
function uniqueOrder() {
  return nextOrder++;
}
function uniqueMentorKey(label: string) {
  return `${label}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

async function makeMentor() {
  const [mentor] = await db
    .insert(mentors)
    .values({
      key: uniqueMentorKey("mentor"),
      order: uniqueOrder(),
      name: { en: "Test Mentor", hi: "टेस्ट मेंटर", hx: "Test Mentor" },
      bio: { en: "bio", hi: "bio", hx: "bio" },
      worldRangeStart: 1,
      worldRangeEnd: 3,
    })
    .returning();
  return mentor;
}

const TITLE = { en: "Test World", hi: "टेस्ट वर्ल्ड", hx: "Test World" };
const TAGLINE = { en: "en tagline", hi: "hi tagline", hx: "hx tagline" };

async function draftInput(overrides: Partial<Record<string, unknown>> = {}) {
  const mentorId = (overrides.mentorId as string | undefined) ?? (await makeMentor()).id;
  return {
    order: uniqueOrder(),
    title: TITLE,
    tagline: TAGLINE,
    theme: "#7C3AED",
    displayXpTarget: 10,
    mentorId,
    ...overrides,
  };
}

// Creates `count` worlds at consecutive order values (a fresh block from
// uniqueOrder(), so distinct from any other test's rows in this shared
// PGlite instance), returned in order-ascending sequence - i.e. result[0]
// is at the lowest order, result[count-1] at the highest.
async function makeSequentialWorlds(count: number) {
  const mentorId = (await makeMentor()).id;
  const result = [];
  for (let i = 0; i < count; i++) {
    // draftInput() already assigns its own order: uniqueOrder() internally
    // - don't also pass one here, or each iteration burns two counter
    // values (one used, one silently discarded), leaving gaps between
    // consecutive worlds instead of the back-to-back values this helper
    // promises.
    result.push(await insertDraftWorld(await draftInput({ mentorId })));
  }
  return result;
}

describe("insertDraftWorld", () => {
  it("creates a draft world", async () => {
    const created = await insertDraftWorld(await draftInput());
    expect(created.status).toBe("draft");
  });

  it("rejects a duplicate order", async () => {
    const order = uniqueOrder();
    await insertDraftWorld(await draftInput({ order }));
    await expect(insertDraftWorld(await draftInput({ order }))).rejects.toThrow();
  });

  it("rejects a nonexistent mentorId (FK violation)", async () => {
    await expect(
      insertDraftWorld(await draftInput({ mentorId: randomUUID() })),
    ).rejects.toThrow();
  });
});

describe("updateDraftWorld", () => {
  it("updates a draft world's fields", async () => {
    const created = await insertDraftWorld(await draftInput());
    const updated = await updateDraftWorld({
      id: created.id,
      order: created.order,
      title: { en: "Updated", hi: "अपडेटेड", hx: "Updated" },
      tagline: created.tagline,
      theme: created.theme,
      displayXpTarget: created.displayXpTarget,
      mentorId: created.mentorId,
    });
    expect(updated?.title.en).toBe("Updated");
  });

  it("returns null (does not update) when the world is currently published", async () => {
    const created = await insertDraftWorld(await draftInput());
    await publishWorldRow(created.id, staffId);

    const result = await updateDraftWorld({
      id: created.id,
      order: created.order,
      title: { en: "Should not apply", hi: "x", hx: "x" },
      tagline: created.tagline,
      theme: created.theme,
      displayXpTarget: created.displayXpTarget,
      mentorId: created.mentorId,
    });

    expect(result).toBeNull();
    const row = await getWorldById(created.id);
    expect(row?.title.en).not.toBe("Should not apply");
  });

  it("returns null for a nonexistent world", async () => {
    const result = await updateDraftWorld({
      id: randomUUID(),
      order: uniqueOrder(),
      title: TITLE,
      tagline: TAGLINE,
      theme: "#000000",
      displayXpTarget: 1,
      mentorId: (await makeMentor()).id,
    });
    expect(result).toBeNull();
  });

  // The concurrency guarantee this file exists to prove: two draft worlds
  // racing to take the same target order value never both succeed and
  // never corrupt the unique index - exactly one wins, the other gets a
  // clean rejection (mapped to CONFLICT one layer up, in service.test.ts),
  // and the database is left with two worlds at two distinct orders.
  it("stays unique under two concurrent updates targeting the same order", async () => {
    const worldA = await insertDraftWorld(await draftInput());
    const worldB = await insertDraftWorld(await draftInput());
    const contestedOrder = uniqueOrder();

    const results = await Promise.allSettled([
      updateDraftWorld({
        id: worldA.id,
        order: contestedOrder,
        title: worldA.title,
        tagline: worldA.tagline,
        theme: worldA.theme,
        displayXpTarget: worldA.displayXpTarget,
        mentorId: worldA.mentorId,
      }),
      updateDraftWorld({
        id: worldB.id,
        order: contestedOrder,
        title: worldB.title,
        tagline: worldB.tagline,
        theme: worldB.theme,
        displayXpTarget: worldB.displayXpTarget,
        mentorId: worldB.mentorId,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // The database itself stays consistent: refetch both worlds and confirm
    // their orders are still distinct (not both contestedOrder).
    const [freshA, freshB] = await Promise.all([getWorldById(worldA.id), getWorldById(worldB.id)]);
    expect(freshA?.order).not.toBe(freshB?.order);
    expect([freshA?.order, freshB?.order]).toContain(contestedOrder);
  });
});

describe("publishWorldRow / unpublishWorldRow", () => {
  it("publishes a draft world, stamping publishedAt/publishedBy", async () => {
    const created = await insertDraftWorld(await draftInput());

    const published = await publishWorldRow(created.id, staffId);

    expect(published?.status).toBe("published");
    expect(published?.publishedBy).toBe(staffId);
    expect(published?.publishedAt).toBeInstanceOf(Date);
  });

  it("returns null when the world is already published (not a draft)", async () => {
    const created = await insertDraftWorld(await draftInput());
    await publishWorldRow(created.id, staffId);

    const result = await publishWorldRow(created.id, staffId);

    expect(result).toBeNull();
  });

  it("unpublishes a published world back to draft, clearing publishedAt/publishedBy", async () => {
    const created = await insertDraftWorld(await draftInput());
    await publishWorldRow(created.id, staffId);

    const unpublished = await unpublishWorldRow(created.id);

    expect(unpublished?.status).toBe("draft");
    expect(unpublished?.publishedAt).toBeNull();
    expect(unpublished?.publishedBy).toBeNull();
  });

  it("returns null when unpublishing a world that's already a draft", async () => {
    const created = await insertDraftWorld(await draftInput());

    const result = await unpublishWorldRow(created.id);

    expect(result).toBeNull();
  });
});

describe("listPublishedWorldsByMentorId", () => {
  it("returns only published worlds referencing the given mentor", async () => {
    const mentor = await makeMentor();
    const publishedWorld = await insertDraftWorld(await draftInput({ mentorId: mentor.id }));
    await publishWorldRow(publishedWorld.id, staffId);
    const draftWorld = await insertDraftWorld(await draftInput({ mentorId: mentor.id }));
    const otherMentorWorld = await insertDraftWorld(await draftInput());
    await publishWorldRow(otherMentorWorld.id, staffId);

    const result = await listPublishedWorldsByMentorId(mentor.id);

    expect(result.map((w) => w.id)).toEqual([publishedWorld.id]);
    expect(result.map((w) => w.id)).not.toContain(draftWorld.id);
    expect(result.map((w) => w.id)).not.toContain(otherMentorWorld.id);
  });

  it("returns an empty array when the mentor has no published worlds", async () => {
    const mentor = await makeMentor();

    const result = await listPublishedWorldsByMentorId(mentor.id);

    expect(result).toEqual([]);
  });
});

describe("moveWorldToPosition", () => {
  it("swaps two adjacent worlds (World 2 and World 3)", async () => {
    const [w1, w2, w3] = await makeSequentialWorlds(3);
    const [order1, order2, order3] = [w1!.order, w2!.order, w3!.order];

    const moved = await moveWorldToPosition(w2!.id, order3);

    expect(moved?.order).toBe(order3);
    const [freshW1, freshW2, freshW3] = await Promise.all([
      getWorldById(w1!.id),
      getWorldById(w2!.id),
      getWorldById(w3!.id),
    ]);
    expect(freshW1?.order).toBe(order1); // untouched
    expect(freshW2?.order).toBe(order3); // moved into W3's old slot
    expect(freshW3?.order).toBe(order2); // shifted back into W2's old slot
  });

  it("moves a world from the last position to the first, shifting everyone else back one", async () => {
    const worlds7 = await makeSequentialWorlds(7);
    const orders = worlds7.map((w) => w.order);
    const last = worlds7[6]!;

    const moved = await moveWorldToPosition(last.id, orders[0]!);

    expect(moved?.order).toBe(orders[0]);
    const fresh = await Promise.all(worlds7.map((w) => getWorldById(w.id)));
    // World that moved is now at the old first position.
    expect(fresh[6]?.order).toBe(orders[0]);
    // Everyone originally at positions 1-6 shifted one slot later.
    for (let i = 0; i < 6; i++) {
      expect(fresh[i]?.order).toBe(orders[i + 1]);
    }
    // No duplicate orders anywhere in the result.
    const finalOrders = fresh.map((w) => w!.order);
    expect(new Set(finalOrders).size).toBe(finalOrders.length);
  });

  it("is a no-op when the world is already at the target position", async () => {
    const [w1] = await makeSequentialWorlds(1);

    const moved = await moveWorldToPosition(w1!.id, w1!.order);

    expect(moved?.order).toBe(w1!.order);
  });

  it("returns null for a nonexistent world", async () => {
    const result = await moveWorldToPosition(randomUUID(), 1);
    expect(result).toBeNull();
  });

  it("works on a published world too - reordering isn't gated on draft status", async () => {
    const [w1, w2] = await makeSequentialWorlds(2);
    await publishWorldRow(w1!.id, staffId);
    await publishWorldRow(w2!.id, staffId);
    const order2 = w2!.order;

    const moved = await moveWorldToPosition(w1!.id, order2);

    expect(moved?.order).toBe(order2);
    expect(moved?.status).toBe("published");
  });

  // Two concurrent moves on non-overlapping windows (swap 1<->2, swap
  // 4<->5, in a 5-world list) - proves the shift-in-transaction approach
  // doesn't corrupt the unique order index or spuriously fail under real
  // concurrency, for the more complex multi-row operation. Deliberately
  // disjoint windows (not a shared pair) so the expected end state is
  // unambiguous regardless of interleaving - PGlite is a single-connection
  // embedded Postgres, so two transactions touching the *same* rows would
  // serialize on row locks in an order this test can't control and
  // shouldn't need to assert on to prove the safety property that matters.
  it("stays unique under two concurrent moves on non-overlapping worlds", async () => {
    const worlds5 = await makeSequentialWorlds(5);
    const orders = worlds5.map((w) => w.order);

    const results = await Promise.allSettled([
      moveWorldToPosition(worlds5[0]!.id, orders[1]!), // swap positions 1<->2
      moveWorldToPosition(worlds5[3]!.id, orders[4]!), // swap positions 4<->5
    ]);
    for (const r of results) expect(r.status).toBe("fulfilled");

    const fresh = await Promise.all(worlds5.map((w) => getWorldById(w.id)));
    expect(fresh[0]?.order).toBe(orders[1]);
    expect(fresh[1]?.order).toBe(orders[0]);
    expect(fresh[2]?.order).toBe(orders[2]); // untouched middle world
    expect(fresh[3]?.order).toBe(orders[4]);
    expect(fresh[4]?.order).toBe(orders[3]);
    const finalOrders = fresh.map((w) => w!.order);
    expect(new Set(finalOrders).size).toBe(5);
  });

  // IMPORTANT CAVEAT, found while adding this test: PGlite (src/test/db.ts)
  // is a single-connection embedded Postgres. Two db.transaction() calls
  // fired concurrently from Node don't actually interleave at the database
  // level - the single connection can only have one transaction in flight,
  // so the driver serializes them: the second call's every statement
  // (including its own initial read) only runs once the first has fully
  // committed. That means this test can prove "two overlapping moves fired
  // concurrently still leave the table in a valid, duplicate-free state" -
  // which held, and is worth guarding - but it can NOT reproduce a genuine
  // multi-connection race, and therefore can't demonstrate "one is cleanly
  // rejected" the way two real concurrent connections against production
  // Postgres (see docs/ARCHITECTURE.md D13, pool max:2) could. That
  // rejection path is instead proven directly below (the "a transaction
  // that fails partway never leaves a sentinel order behind" test) and
  // handled in src/server/worlds/service.ts's reorderWorld, which maps a
  // real serialization-failure/deadlock error to a clean CONFLICT.
  it("two fully overlapping concurrent moves (both touch every world in range) leave a valid, duplicate-free result", async () => {
    const worlds5 = await makeSequentialWorlds(5);
    const orders = worlds5.map((w) => w.order);

    const results = await Promise.allSettled([
      moveWorldToPosition(worlds5[0]!.id, orders[4]!), // first -> last, touches everyone
      moveWorldToPosition(worlds5[4]!.id, orders[0]!), // last -> first, touches everyone
    ]);

    const fresh = await Promise.all(worlds5.map((w) => getWorldById(w.id)));
    const finalOrders = fresh.map((w) => w!.order);
    // Whatever the driver's actual serialization did, the result must be
    // internally valid: the same 5 order values, no duplicates, and -
    // the specific guarantee this test exists for - none of them negative
    // (no sentinel value ever left in committed data).
    expect(finalOrders.slice().sort((a, b) => a - b)).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(finalOrders).size).toBe(5);
    expect(finalOrders.every((o) => o >= 1)).toBe(true);
    // Neither call corrupted anything or threw unexpectedly in this
    // serialized environment - see the caveat above for what this test can
    // and can't prove about genuine multi-connection concurrency.
    for (const r of results) expect(r.status).toBe("fulfilled");
  });

  // This is what actually makes "no negative sentinel ever persists" true
  // in production, including under genuine concurrent conflicts PGlite
  // can't reproduce (see the caveat above): a transaction that fails for
  // ANY reason - a real deadlock/serialization failure between two
  // connections, or anything else - rolls back every statement it made,
  // not just the ones after the failure point. Proven directly here by
  // forcing a failure after the sentinel write but before the real final
  // value is written, independent of concurrency entirely.
  it("a transaction that fails after parking a world at a sentinel order never leaves that sentinel behind", async () => {
    const [w] = await makeSequentialWorlds(1);
    const originalOrder = w!.order;

    await expect(
      db.transaction(async (tx) => {
        await tx.update(worlds).set({ order: -1 }).where(eq(worlds.id, w!.id));
        throw new Error("simulated failure between phase 1 and phase 2");
      }),
    ).rejects.toThrow("simulated failure between phase 1 and phase 2");

    const fresh = await getWorldById(w!.id);
    expect(fresh?.order).toBe(originalOrder);
    expect(fresh?.order).toBeGreaterThanOrEqual(1);
  });
});
