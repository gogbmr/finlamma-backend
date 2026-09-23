// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the freeze/streak-break transitions and the
// same-IST-day idempotency actually hold at the database level (the row
// lock itself can't be proven genuinely concurrent against a single-
// connection PGlite instance - see docs/ROADMAP.md's pre-launch checklist
// note on this same limitation for world reorder - but the transition
// LOGIC these tests exercise is identical either way). Never touches the
// real Supabase database (see @/db/client's NODE_ENV=test guard).
import { afterAll, describe, expect, it, vi } from "vitest";
import { users } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const { getStreak, recordStreakActivity } = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

async function makeUser() {
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: uniqueClerkUserId("streaks-repo-user"),
      clerkUpdatedAt: new Date(),
      firstName: "Aarav",
      lastInitial: "S",
    })
    .returning();
  return user;
}

const FREEZES = 2;

describe("recordStreakActivity", () => {
  it("creates a new streak of 1 on the first-ever activity", async () => {
    const user = await makeUser();

    const result = await recordStreakActivity(user.id, "learning", "2026-01-05", FREEZES);

    expect(result).toMatchObject({ current: 1, longest: 1, lastActiveDateIst: "2026-01-05", extended: true });
    expect(result.freezesLeft).toBe(FREEZES);
  });

  it("is idempotent - a second activity the SAME IST day does not advance the streak", async () => {
    const user = await makeUser();
    await recordStreakActivity(user.id, "learning", "2026-01-05", FREEZES);

    const result = await recordStreakActivity(user.id, "learning", "2026-01-05", FREEZES);

    expect(result).toMatchObject({ current: 1, extended: false });
  });

  it("extends the streak on the very next consecutive IST day", async () => {
    const user = await makeUser();
    await recordStreakActivity(user.id, "learning", "2026-01-05", FREEZES);

    const result = await recordStreakActivity(user.id, "learning", "2026-01-06", FREEZES);

    expect(result).toMatchObject({ current: 2, longest: 2, extended: true });
  });

  it("auto-covers exactly one missed day with a freeze, consuming it", async () => {
    const user = await makeUser();
    await recordStreakActivity(user.id, "learning", "2026-01-05", FREEZES);

    // 2026-01-06 missed entirely - activity resumes on 2026-01-07 (gap = 2).
    const result = await recordStreakActivity(user.id, "learning", "2026-01-07", FREEZES);

    expect(result).toMatchObject({ current: 2, freezesLeft: FREEZES - 1, extended: true });
  });

  it("breaks the streak when 2+ days are missed, even with freezes available", async () => {
    const user = await makeUser();
    await recordStreakActivity(user.id, "learning", "2026-01-05", FREEZES);

    // Missed 2026-01-06 AND 2026-01-07 - activity resumes on 2026-01-08 (gap = 3).
    const result = await recordStreakActivity(user.id, "learning", "2026-01-08", FREEZES);

    expect(result).toMatchObject({ current: 1, freezesLeft: FREEZES, extended: true }); // freezes untouched
  });

  it("breaks the streak on a single missed day once freezes are exhausted", async () => {
    const user = await makeUser();
    await recordStreakActivity(user.id, "learning", "2026-01-01", FREEZES);
    await recordStreakActivity(user.id, "learning", "2026-01-03", FREEZES); // uses freeze 1 of 2
    await recordStreakActivity(user.id, "learning", "2026-01-05", FREEZES); // uses freeze 2 of 2

    const before = await getStreak(user.id, "learning");
    expect(before?.freezesLeft).toBe(0);

    const result = await recordStreakActivity(user.id, "learning", "2026-01-07", FREEZES); // no freezes left

    expect(result).toMatchObject({ current: 1, extended: true });
  });

  it("resets the freeze allowance at the first activity of a new IST month", async () => {
    const user = await makeUser();
    await recordStreakActivity(user.id, "learning", "2026-01-01", FREEZES);
    await recordStreakActivity(user.id, "learning", "2026-01-03", FREEZES); // 1 freeze used (Jan)
    await recordStreakActivity(user.id, "learning", "2026-01-05", FREEZES); // 2nd freeze used (Jan) - 0 left

    // First activity in February - allowance resets before this day's gap
    // is even evaluated, so a freeze is available again.
    const result = await recordStreakActivity(user.id, "learning", "2026-02-02", FREEZES); // gap=2 from Jan 5? no: Jan 31 not visited

    // Jan 5 -> Feb 2 is a large gap (28 days) - streak breaks regardless of
    // freezes, but the allowance itself must show as reset.
    expect(result.current).toBe(1);
    expect(result.freezesLeft).toBe(FREEZES);
    expect(result.freezesResetMonth).toBe("2026-02");
  });

  it("tracks independent streaks per scope for the same user", async () => {
    const user = await makeUser();
    await recordStreakActivity(user.id, "learning", "2026-01-05", FREEZES);

    const pulseCheck = await getStreak(user.id, "pulse_check");

    expect(pulseCheck).toBeNull(); // untouched scope has no row at all
  });

  it("tracks independent streaks per user for the same scope", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    await recordStreakActivity(userA.id, "learning", "2026-01-05", FREEZES);

    const resultB = await recordStreakActivity(userB.id, "learning", "2026-01-05", FREEZES);

    expect(resultB.current).toBe(1); // A's activity never touched B's streak
  });
});
