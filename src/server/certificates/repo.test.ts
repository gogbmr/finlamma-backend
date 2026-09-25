// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the unique (user_id, world_id) idempotency constraint
// and the separate unique `code` constraint both actually hold at the
// database level, the way src/server/certificates/service.ts's issuance
// loop relies on. Never touches the real Supabase database (see
// @/db/client's NODE_ENV=test guard).
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { mentors, users, worlds } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  countCertificatesForWorldSinceYearStart,
  getCertificate,
  insertCertificateIfAbsent,
  listCertificatesForUser,
  setCertificateFileKey,
} = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

let nextOrder = 200_000;
function uniqueOrder() {
  return nextOrder++;
}
function uniqueKey(label: string) {
  return `${label}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

async function makeUser() {
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: uniqueClerkUserId("certificates-repo-user"),
      clerkUpdatedAt: new Date(),
      firstName: "Aarav",
      lastInitial: "S",
    })
    .returning();
  return user;
}

async function makeWorld() {
  const [mentor] = await db
    .insert(mentors)
    .values({
      key: uniqueKey("mentor"),
      order: uniqueOrder(),
      name: { en: "Test Mentor", hi: "x", hx: "x" },
      bio: { en: "x", hi: "x", hx: "x" },
      persona: "test persona",
    })
    .returning();
  const [world] = await db
    .insert(worlds)
    .values({
      order: uniqueOrder(),
      // The DB column itself has no format constraint (only the Zod schema
      // does, at the admin-editor layer) - any unique string works here.
      code: uniqueKey("world-code"),
      title: { en: "Test World", hi: "x", hx: "x" },
      tagline: { en: "x", hi: "x", hx: "x" },
      theme: "#000000",
      displayXpTarget: 5,
      mentorId: mentor.id,
    })
    .returning();
  return world;
}

describe("insertCertificateIfAbsent", () => {
  it("is idempotent on (userId, worldId) - a duplicate insert is a silent no-op", async () => {
    const user = await makeUser();
    const world = await makeWorld();

    const first = await insertCertificateIfAbsent({
      userId: user.id,
      worldId: world.id,
      code: `FL-${world.code}-2026-000001`,
      xpEarned: 1000,
      accuracyPct: 90,
    });
    const second = await insertCertificateIfAbsent({
      userId: user.id,
      worldId: world.id,
      code: `FL-${world.code}-2026-000002`, // even a different code doesn't matter
      xpEarned: 2000,
      accuracyPct: 100,
    });

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    const rows = await listCertificatesForUser(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].xpEarned).toBe(1000); // the first insert's values stuck
  });

  it("throws (not silently swallowed) on a `code` collision across two different users", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const worldA = await makeWorld();
    const worldB = await makeWorld();
    const sharedCode = `FL-XX-2026-${uniqueKey("seq").slice(0, 6)}`;

    await insertCertificateIfAbsent({
      userId: userA.id,
      worldId: worldA.id,
      code: sharedCode,
      xpEarned: 100,
      accuracyPct: 80,
    });

    // drizzle-orm wraps the driver's PostgresError in a DrizzleQueryError -
    // the real code lives on `.cause` (see src/lib/db-errors.ts).
    await expect(
      insertCertificateIfAbsent({
        userId: userB.id,
        worldId: worldB.id,
        code: sharedCode,
        xpEarned: 200,
        accuracyPct: 90,
      }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });
});

describe("getCertificate / listCertificatesForUser", () => {
  it("returns null for a world the user hasn't completed", async () => {
    const user = await makeUser();
    const world = await makeWorld();

    expect(await getCertificate(user.id, world.id)).toBeNull();
  });

  it("lists newest first", async () => {
    const user = await makeUser();
    const worldOld = await makeWorld();
    const worldNew = await makeWorld();
    await insertCertificateIfAbsent({
      userId: user.id,
      worldId: worldOld.id,
      code: uniqueKey("FL-AA-2026"),
      xpEarned: 100,
      accuracyPct: 80,
    });
    await insertCertificateIfAbsent({
      userId: user.id,
      worldId: worldNew.id,
      code: uniqueKey("FL-BB-2026"),
      xpEarned: 200,
      accuracyPct: 90,
    });

    const rows = await listCertificatesForUser(user.id);
    expect(rows.map((r) => r.worldId)).toEqual([worldNew.id, worldOld.id]);
  });
});

describe("setCertificateFileKey", () => {
  it("sets fileKey once and never overwrites it on a later call", async () => {
    const user = await makeUser();
    const world = await makeWorld();
    const cert = await insertCertificateIfAbsent({
      userId: user.id,
      worldId: world.id,
      code: uniqueKey("FL-CC-2026"),
      xpEarned: 100,
      accuracyPct: 80,
    });

    const first = await setCertificateFileKey(cert!.id, "certificates/first.pdf");
    const second = await setCertificateFileKey(cert!.id, "certificates/second.pdf");

    expect(first?.fileKey).toBe("certificates/first.pdf");
    expect(second).toBeNull(); // already set - guarded no-op
    const row = await getCertificate(user.id, world.id);
    expect(row?.fileKey).toBe("certificates/first.pdf");
  });
});

describe("countCertificatesForWorldSinceYearStart", () => {
  it("counts only certificates for this world, not others", async () => {
    const user = await makeUser();
    const world = await makeWorld();
    const otherWorld = await makeWorld();
    await insertCertificateIfAbsent({
      userId: user.id,
      worldId: world.id,
      code: uniqueKey("FL-DD-2026"),
      xpEarned: 100,
      accuracyPct: 80,
    });
    await insertCertificateIfAbsent({
      userId: user.id,
      worldId: otherWorld.id,
      code: uniqueKey("FL-EE-2026"),
      xpEarned: 100,
      accuracyPct: 80,
    });

    const count = await countCertificatesForWorldSinceYearStart(world.id, new Date("2020-01-01T00:00:00Z"));
    expect(count).toBe(1);
  });

  it("excludes certificates issued before the given year-start boundary", async () => {
    const user = await makeUser();
    const world = await makeWorld();
    await insertCertificateIfAbsent({
      userId: user.id,
      worldId: world.id,
      code: uniqueKey("FL-FF-2026"),
      xpEarned: 100,
      accuracyPct: 80,
    });

    const count = await countCertificatesForWorldSinceYearStart(
      world.id,
      new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow - excludes everything so far
    );
    expect(count).toBe(0);
  });
});
