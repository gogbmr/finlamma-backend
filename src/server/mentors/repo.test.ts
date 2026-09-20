// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the real unique constraints (key, order) and the
// draft-only update/publish guards actually hold at the database level.
// Never touches the real Supabase database (see @/db/client's NODE_ENV=test
// guard). src/server/mentors/service.test.ts covers the service layer with
// this repo mocked out.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { roles, staffMembers } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  getMentorById,
  insertDraftMentor,
  publishMentorRow,
  unpublishMentorRow,
  updateDraftMentor,
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
  .values({ clerkUserId: uniqueClerkUserId("mentors-repo-test-staff"), roleId: testRole.id })
  .returning();
const staffId = testStaff.id;

let nextOrder = 100_000;
function uniqueKey(label: string) {
  return `${label}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}
function uniqueOrder() {
  return nextOrder++;
}

const NAME = { en: "Test Mentor", hi: "टेस्ट मेंटर", hx: "Test Mentor" };
const BIO = { en: "en bio", hi: "hi bio", hx: "hx bio" };

function draftInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    key: uniqueKey("mentor"),
    order: uniqueOrder(),
    name: NAME,
    bio: BIO,
    worldRangeStart: 1,
    worldRangeEnd: 3,
    ...overrides,
  };
}

describe("insertDraftMentor", () => {
  it("creates a draft mentor", async () => {
    const created = await insertDraftMentor(draftInput());
    expect(created.status).toBe("draft");
  });

  it("rejects a duplicate key", async () => {
    const key = uniqueKey("dup");
    await insertDraftMentor(draftInput({ key }));
    await expect(insertDraftMentor(draftInput({ key }))).rejects.toThrow();
  });

  it("rejects a duplicate order", async () => {
    const order = uniqueOrder();
    await insertDraftMentor(draftInput({ order }));
    await expect(insertDraftMentor(draftInput({ order }))).rejects.toThrow();
  });
});

describe("updateDraftMentor", () => {
  it("updates a draft mentor's fields", async () => {
    const created = await insertDraftMentor(draftInput());
    const updated = await updateDraftMentor({
      id: created.id,
      order: created.order,
      name: { en: "Updated", hi: "अपडेटेड", hx: "Updated" },
      bio: created.bio,
      worldRangeStart: created.worldRangeStart,
      worldRangeEnd: created.worldRangeEnd,
    });
    expect(updated?.name.en).toBe("Updated");
  });

  it("returns null (does not update) when the mentor is currently published", async () => {
    const created = await insertDraftMentor(draftInput());
    await publishMentorRow(created.id, staffId);

    const result = await updateDraftMentor({
      id: created.id,
      order: created.order,
      name: { en: "Should not apply", hi: "x", hx: "x" },
      bio: created.bio,
      worldRangeStart: created.worldRangeStart,
      worldRangeEnd: created.worldRangeEnd,
    });

    expect(result).toBeNull();
    const row = await getMentorById(created.id);
    expect(row?.name.en).not.toBe("Should not apply");
  });

  it("returns null for a nonexistent mentor", async () => {
    const result = await updateDraftMentor({
      id: randomUUID(),
      order: uniqueOrder(),
      name: NAME,
      bio: BIO,
      worldRangeStart: 1,
      worldRangeEnd: null,
    });
    expect(result).toBeNull();
  });
});

describe("publishMentorRow / unpublishMentorRow", () => {
  it("publishes a draft mentor, stamping publishedAt/publishedBy", async () => {
    const created = await insertDraftMentor(draftInput());

    const published = await publishMentorRow(created.id, staffId);

    expect(published?.status).toBe("published");
    expect(published?.publishedBy).toBe(staffId);
    expect(published?.publishedAt).toBeInstanceOf(Date);
  });

  it("returns null when the mentor is already published (not a draft)", async () => {
    const created = await insertDraftMentor(draftInput());
    await publishMentorRow(created.id, staffId);

    const result = await publishMentorRow(created.id, staffId);

    expect(result).toBeNull();
  });

  it("unpublishes a published mentor back to draft, clearing publishedAt/publishedBy", async () => {
    const created = await insertDraftMentor(draftInput());
    await publishMentorRow(created.id, staffId);

    const unpublished = await unpublishMentorRow(created.id);

    expect(unpublished?.status).toBe("draft");
    expect(unpublished?.publishedAt).toBeNull();
    expect(unpublished?.publishedBy).toBeNull();
  });

  it("returns null when unpublishing a mentor that's already a draft", async () => {
    const created = await insertDraftMentor(draftInput());

    const result = await unpublishMentorRow(created.id);

    expect(result).toBeNull();
  });
});
