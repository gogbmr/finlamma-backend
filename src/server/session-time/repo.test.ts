// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the (userId, dateIst) upsert-increment actually
// accumulates at the database level. Never touches the real Supabase
// database (see @/db/client's NODE_ENV=test guard).
import { afterAll, describe, expect, it, vi } from "vitest";
import { users } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const { addSessionSeconds, getSessionSecondsForDate } = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

async function makeUser() {
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: uniqueClerkUserId("session-time-repo-user"),
      clerkUpdatedAt: new Date(),
      firstName: "Aarav",
      lastInitial: "S",
    })
    .returning();
  return user;
}

describe("addSessionSeconds / getSessionSecondsForDate", () => {
  it("starts a new day's total from the first ping", async () => {
    const user = await makeUser();

    await addSessionSeconds(user.id, "2026-09-24", 240);

    expect(await getSessionSecondsForDate(user.id, "2026-09-24")).toBe(240);
  });

  it("accumulates across multiple pings the same (IST) day", async () => {
    const user = await makeUser();

    await addSessionSeconds(user.id, "2026-09-24", 240);
    await addSessionSeconds(user.id, "2026-09-24", 300);
    await addSessionSeconds(user.id, "2026-09-24", 60);

    expect(await getSessionSecondsForDate(user.id, "2026-09-24")).toBe(600);
  });

  it("keeps different days independent", async () => {
    const user = await makeUser();

    await addSessionSeconds(user.id, "2026-09-24", 240);
    await addSessionSeconds(user.id, "2026-09-25", 500);

    expect(await getSessionSecondsForDate(user.id, "2026-09-24")).toBe(240);
    expect(await getSessionSecondsForDate(user.id, "2026-09-25")).toBe(500);
  });

  it("returns 0 for a date with no pings yet", async () => {
    const user = await makeUser();

    expect(await getSessionSecondsForDate(user.id, "2026-01-01")).toBe(0);
  });
});
