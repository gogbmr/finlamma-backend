// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the real unique constraint on `order`, the mentor FK,
// the draft-only update/publish guards, and genuine concurrent-update
// behavior actually hold at the database level. Never touches the real
// Supabase database (see @/db/client's NODE_ENV=test guard).
// src/server/worlds/service.test.ts covers the service layer with this repo
// mocked out.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { mentors, roles, staffMembers } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  getWorldById,
  insertDraftWorld,
  listPublishedWorldsByMentorId,
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
