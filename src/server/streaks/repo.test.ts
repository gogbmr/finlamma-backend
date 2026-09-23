// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the freeze/streak-break transitions and the
// same-IST-day idempotency actually hold at the database level (the row
// lock itself can't be proven genuinely concurrent against a single-
// connection PGlite instance - see docs/ROADMAP.md's pre-launch checklist
// note on this same limitation for world reorder - but the transition
// LOGIC these tests exercise is identical either way). Never touches the
// real Supabase database (see @/db/client's NODE_ENV=test guard).
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { streaks, users } from "@/db/schema";
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

  it("breaks the streak after a 10-day gap, regardless of freezes remaining", async () => {
    const user = await makeUser();
    await recordStreakActivity(user.id, "learning", "2026-01-05", FREEZES);

    // Activity resumes 10 days later, with both freezes still untouched -
    // proves a big gap can't be covered by having "enough" freezes saved up.
    const result = await recordStreakActivity(user.id, "learning", "2026-01-15", FREEZES);

    expect(result).toMatchObject({ current: 1, freezesLeft: FREEZES, extended: true });
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

  it("two concurrent first-ever activities for the same user/scope never throw and converge to one row", async () => {
    const user = await makeUser();

    // Fired together via Promise.all, not awaited one-then-the-other. Note:
    // PGlite is a single-connection instance (see this file's header
    // comment), so in practice these two db.transaction() calls fully
    // serialize rather than genuinely interleave - the second call's own
    // SELECT ... FOR UPDATE only runs once the first has committed, so this
    // test alone can't prove the race actually reaches the
    // onConflictDoNothing branch (the next test proves that mechanism
    // directly). What this test DOES lock in: however the two calls end up
    // interleaved by whatever driver runs this in production, neither may
    // ever throw, and they must converge to exactly one row.
    const results = await Promise.all([
      recordStreakActivity(user.id, "learning", "2026-01-05", FREEZES),
      recordStreakActivity(user.id, "learning", "2026-01-05", FREEZES),
    ]);

    expect(results.map((r) => r.current)).toEqual([1, 1]);
    const row = await getStreak(user.id, "learning");
    expect(row).toMatchObject({ current: 1, longest: 1, lastActiveDateIst: "2026-01-05" });
  });

  it("the insert's onConflictDoNothing genuinely returns empty (not a thrown unique-violation) against a real conflicting row", async () => {
    // Deterministically proves the exact DB-level mechanism
    // recordStreakActivity's race fix depends on, since true concurrent
    // interleaving can't be forced against PGlite's single connection
    // (see the test above). Reproduces the shape of the insert in
    // src/server/streaks/repo.ts exactly: same target table, same
    // (userId, scope) conflict target.
    const user = await makeUser();
    await db.insert(streaks).values({
      userId: user.id,
      scope: "learning",
      current: 1,
      longest: 1,
      lastActiveDateIst: "2026-01-05",
      freezesLeft: FREEZES,
      freezesResetMonth: "2026-01",
    });

    const conflicting = await db
      .insert(streaks)
      .values({
        userId: user.id,
        scope: "learning",
        current: 1,
        longest: 1,
        lastActiveDateIst: "2026-01-05",
        freezesLeft: FREEZES,
        freezesResetMonth: "2026-01",
      })
      .onConflictDoNothing({ target: [streaks.userId, streaks.scope] })
      .returning();

    expect(conflicting).toEqual([]); // empty, not a thrown exception
    const rows = await db
      .select()
      .from(streaks)
      .where(and(eq(streaks.userId, user.id), eq(streaks.scope, "learning")));
    expect(rows).toHaveLength(1); // the conflicting insert changed nothing
  });

  it("tracks independent streaks per user for the same scope", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    await recordStreakActivity(userA.id, "learning", "2026-01-05", FREEZES);

    const resultB = await recordStreakActivity(userB.id, "learning", "2026-01-05", FREEZES);

    expect(resultB.current).toBe(1); // A's activity never touched B's streak
  });
});
