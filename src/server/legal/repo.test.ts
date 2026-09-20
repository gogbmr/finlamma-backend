// Integration test: runs against an in-process PGlite database (src/test/db.ts)
// instead of mocking `db`, because what's under test here - publishDraft's
// placeholder override actually reaching the database - can't be observed
// through a mock (src/server/legal/service.test.ts already covers the
// service layer with the repo mocked out; this is the one real-DB check for
// the repo layer's own logic). Never touches the real Supabase database (see
// @/db/client's NODE_ENV=test guard).
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { legalDocuments, roles, staffMembers } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const { publishDraft } = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

// publishedBy is a real FK to staff_members, so publishDraft's staffId needs
// a genuine row to reference - seeded once here, not per-test.
const [testRole] = await db
  .insert(roles)
  .values({ key: "super_admin", name: "Super Admin" })
  .returning();
const [testStaff] = await db
  .insert(staffMembers)
  .values({ clerkUserId: uniqueClerkUserId("legal-repo-test-staff"), roleId: testRole.id })
  .returning();
const staffId = testStaff.id;

const CONTENT = { en: "en text", hi: "hi text", hx: "hx text" };

async function seedDraft(overrides: Partial<{ isPlaceholder: boolean; version: number }> = {}) {
  const [draft] = await db
    .insert(legalDocuments)
    .values({
      type: "terms",
      version: overrides.version ?? 1,
      content: CONTENT,
      status: "draft",
      isPlaceholder: overrides.isPlaceholder ?? false,
    })
    .returning();
  return draft;
}

describe("publishDraft", () => {
  it("publishes with requiresParentReapproval: true when explicitly asked, for a real (non-placeholder) draft", async () => {
    await seedDraft({ version: 10 });

    const published = await publishDraft("terms", staffId, true);

    expect(published?.status).toBe("published");
    expect(published?.requiresParentReapproval).toBe(true);
  });

  it("publishes with requiresParentReapproval: false when explicitly asked", async () => {
    await seedDraft({ version: 11 });

    const published = await publishDraft("terms", staffId, false);

    expect(published?.requiresParentReapproval).toBe(false);
  });

  // The one guarantee this whole file exists to prove: no matter what staff
  // pass in, a placeholder draft can never end up published with
  // requires_parent_reapproval = true in the database - re-approving filler
  // text makes no sense, and a mis-click must never trigger a wave of real
  // parent-notification emails.
  it("forces requiresParentReapproval to false for a placeholder draft, even when true is passed", async () => {
    await seedDraft({ isPlaceholder: true, version: 12 });

    const published = await publishDraft("terms", staffId, true);

    expect(published?.isPlaceholder).toBe(true);
    expect(published?.requiresParentReapproval).toBe(false);

    // Confirm it's actually persisted this way, not just returned this way.
    const [row] = await db.select().from(legalDocuments).where(eq(legalDocuments.id, published!.id));
    expect(row.requiresParentReapproval).toBe(false);
  });

  it("returns null when there's no draft to publish", async () => {
    const published = await publishDraft("privacy", staffId, true);
    expect(published).toBeNull();
  });
});
