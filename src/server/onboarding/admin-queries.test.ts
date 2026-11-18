// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the real DB query (filters, date-range validation,
// default ordering, page math) actually behaves correctly. Never touches
// the real Supabase database (see @/db/client's NODE_ENV=test guard).
import { afterAll, describe, expect, it, vi } from "vitest";
import { consentRecords, parentContacts, users } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId, uniqueEmail } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const { listConsentRecordsForAdmin } = await import("./admin-queries");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

async function seedConsentRequest(overrides: {
  status?: "pending" | "consented" | "refused" | "withdrawn";
  createdAt?: Date;
  deleted?: boolean;
}) {
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: uniqueClerkUserId("consent-admin-queries-test"),
      firstName: "Test",
      lastInitial: "T",
      clerkUpdatedAt: new Date(),
      deletedAt: overrides.deleted ? new Date() : null,
    })
    .returning();
  const [parentContact] = await db
    .insert(parentContacts)
    .values({ userId: user!.id, name: "Parent", email: uniqueEmail("consent-admin-queries-parent") })
    .returning();
  const [record] = await db
    .insert(consentRecords)
    .values({
      userId: user!.id,
      parentContactId: parentContact!.id,
      status: overrides.status ?? "pending",
      tokenHash: `token-${user!.id}`,
      tokenExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
      createdAt: overrides.createdAt ?? new Date(),
    })
    .returning();
  return { user: user!, record: record! };
}

const defaultParams = {
  page: 1,
  pageSize: 20,
  status: null,
  includeDeleted: false,
  requestedFrom: null,
  requestedTo: null,
};

describe("listConsentRecordsForAdmin", () => {
  it("returns only the fields the page shows today - never email, phone or DOB", async () => {
    const { record } = await seedConsentRequest({});
    const result = await listConsentRecordsForAdmin(defaultParams);
    const row = result.rows.find((r) => r.userId === record.userId);
    expect(row).toBeDefined();
    expect(row).toEqual(
      expect.objectContaining({
        userId: record.userId,
        firstName: "Test",
        lastInitial: "T",
        status: "pending",
      }),
    );
    expect(row).not.toHaveProperty("email");
    expect(row).not.toHaveProperty("phone");
    expect(row).not.toHaveProperty("dateOfBirth");
  });

  it("filters by status", async () => {
    const { record: pending } = await seedConsentRequest({ status: "pending" });
    const { record: consented } = await seedConsentRequest({ status: "consented" });

    const result = await listConsentRecordsForAdmin({ ...defaultParams, status: "consented" });

    const userIds = result.rows.map((r) => r.userId);
    expect(userIds).toContain(consented.userId);
    expect(userIds).not.toContain(pending.userId);
  });

  it("excludes deleted accounts by default, includes them with includeDeleted", async () => {
    const { record: deleted } = await seedConsentRequest({ deleted: true });

    const withoutDeleted = await listConsentRecordsForAdmin(defaultParams);
    expect(withoutDeleted.rows.map((r) => r.userId)).not.toContain(deleted.userId);

    const withDeleted = await listConsentRecordsForAdmin({ ...defaultParams, includeDeleted: true });
    expect(withDeleted.rows.map((r) => r.userId)).toContain(deleted.userId);
  });

  it("filters by requested date range", async () => {
    const { record: inRange } = await seedConsentRequest({
      createdAt: new Date("2026-06-15T00:00:00.000Z"),
    });
    const { record: outOfRange } = await seedConsentRequest({
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    });

    const result = await listConsentRecordsForAdmin({
      ...defaultParams,
      requestedFrom: new Date("2026-06-01T00:00:00.000Z"),
      requestedTo: new Date("2026-06-30T00:00:00.000Z"),
    });

    const userIds = result.rows.map((r) => r.userId);
    expect(userIds).toContain(inRange.userId);
    expect(userIds).not.toContain(outOfRange.userId);
  });

  it("defaults to createdAt ascending (oldest request first), same as today", async () => {
    const { record: older } = await seedConsentRequest({
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const { record: newer } = await seedConsentRequest({
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    });

    const result = await listConsentRecordsForAdmin({ ...defaultParams, pageSize: 100 });

    const olderIndex = result.rows.findIndex((r) => r.userId === older.userId);
    const newerIndex = result.rows.findIndex((r) => r.userId === newer.userId);
    expect(olderIndex).toBeGreaterThanOrEqual(0);
    expect(newerIndex).toBeGreaterThanOrEqual(0);
    expect(olderIndex).toBeLessThan(newerIndex);
  });

  it("clamps page to the last valid page and reports an accurate total/pageCount", async () => {
    const result = await listConsentRecordsForAdmin({ ...defaultParams, page: 999, pageSize: 5 });
    expect(result.page).toBe(result.pageCount);
    expect(result.rows.length).toBeLessThanOrEqual(5);
    expect(result.total).toBeGreaterThan(0);
  });
});
