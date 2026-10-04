// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the (source, event_id) and (user_id, entitlement)
// unique constraints actually hold at the database level, the way
// src/server/monetisation/service.ts's idempotency/upsert logic relies on
// them. Never touches the real Supabase database (see @/db/client's
// NODE_ENV=test guard).
import { afterAll, describe, expect, it, vi } from "vitest";
import { users } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  findUserById,
  getEntitlementsForUser,
  listEntitlementsNearExpiry,
  recordWebhookEventIfNew,
  upsertEntitlement,
} = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

async function makeUser() {
  const [user] = await db
    .insert(users)
    .values({ clerkUserId: uniqueClerkUserId("monetisation-repo-user"), clerkUpdatedAt: new Date() })
    .returning();
  return user;
}

describe("recordWebhookEventIfNew", () => {
  it("is idempotent on (source, eventId) - a replayed delivery is a silent no-op", async () => {
    const first = await recordWebhookEventIfNew("revenuecat", "evt-dup-1");
    const second = await recordWebhookEventIfNew("revenuecat", "evt-dup-1");

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("treats different event ids as independent", async () => {
    expect(await recordWebhookEventIfNew("revenuecat", "evt-a")).toBe(true);
    expect(await recordWebhookEventIfNew("revenuecat", "evt-b")).toBe(true);
  });
});

describe("upsertEntitlement", () => {
  it("creates a new entitlement row for a user with none", async () => {
    const user = await makeUser();

    await upsertEntitlement({
      userId: user.id,
      entitlement: "ad_free",
      source: "revenuecat",
      expiresAt: new Date("2026-01-01T00:00:00Z"),
      raw: { id: "evt-1" },
    });

    const rows = await getEntitlementsForUser(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe("revenuecat");
    expect(rows[0]?.expiresAt?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("overwrites in place on a second call, never creating a second row (current-state, not history)", async () => {
    const user = await makeUser();

    await upsertEntitlement({
      userId: user.id,
      entitlement: "ad_free",
      source: "revenuecat",
      expiresAt: new Date("2026-01-01T00:00:00Z"),
      raw: { id: "evt-1" },
    });
    await upsertEntitlement({
      userId: user.id,
      entitlement: "ad_free",
      source: "revenuecat",
      expiresAt: new Date("2026-02-01T00:00:00Z"),
      raw: { id: "evt-2" },
    });

    const rows = await getEntitlementsForUser(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.expiresAt?.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(rows[0]?.raw).toEqual({ id: "evt-2" });
  });
});

describe("findUserById", () => {
  it("returns null for an id with no matching row", async () => {
    expect(await findUserById("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("returns the row for a real user", async () => {
    const user = await makeUser();
    expect((await findUserById(user.id))?.id).toBe(user.id);
  });
});

describe("listEntitlementsNearExpiry", () => {
  const windowStart = new Date("2026-01-01T00:00:00Z");
  const windowEnd = new Date("2026-01-10T00:00:00Z");

  it("includes a RevenueCat row whose expiresAt falls inside the window", async () => {
    const user = await makeUser();
    await upsertEntitlement({
      userId: user.id,
      entitlement: "ad_free",
      source: "revenuecat",
      expiresAt: new Date("2026-01-05T00:00:00Z"),
      raw: {},
    });

    const rows = await listEntitlementsNearExpiry(windowStart, windowEnd);
    expect(rows.some((r) => r.userId === user.id)).toBe(true);
  });

  it("excludes a row whose expiresAt falls outside the window", async () => {
    const user = await makeUser();
    await upsertEntitlement({
      userId: user.id,
      entitlement: "ad_free",
      source: "revenuecat",
      expiresAt: new Date("2026-06-01T00:00:00Z"),
      raw: {},
    });

    const rows = await listEntitlementsNearExpiry(windowStart, windowEnd);
    expect(rows.some((r) => r.userId === user.id)).toBe(false);
  });

  it("excludes a never-expiring row (expiresAt null), regardless of window", async () => {
    const user = await makeUser();
    await upsertEntitlement({
      userId: user.id,
      entitlement: "ad_free",
      source: "revenuecat",
      expiresAt: null,
      raw: {},
    });

    const rows = await listEntitlementsNearExpiry(windowStart, windowEnd);
    expect(rows.some((r) => r.userId === user.id)).toBe(false);
  });
});
