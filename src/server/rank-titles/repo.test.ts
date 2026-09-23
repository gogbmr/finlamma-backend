// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - never touches the real Supabase database (see @/db/client's
// NODE_ENV=test guard). Proves the (minLevel) unique index and the
// "highest minLevel <= level" lookup actually hold at the database level.
import { afterAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  deleteRankTitleRow,
  getRankTitleForLevel,
  insertRankTitle,
  listRankTitles,
  updateRankTitleRow,
} = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

const TITLE = (word: string) => ({ en: word, hi: word, hx: word });

describe("rank_titles", () => {
  it("returns null when the table is empty", async () => {
    expect(await getRankTitleForLevel(5)).toBeNull();
  });

  it("returns the highest minLevel that's still <= the given level", async () => {
    await insertRankTitle({ minLevel: 1, title: TITLE("Sapling") });
    await insertRankTitle({ minLevel: 5, title: TITLE("Sprout") });
    await insertRankTitle({ minLevel: 10, title: TITLE("Bloom") });

    expect((await getRankTitleForLevel(1))?.title).toEqual(TITLE("Sapling"));
    expect((await getRankTitleForLevel(4))?.title).toEqual(TITLE("Sapling"));
    expect((await getRankTitleForLevel(5))?.title).toEqual(TITLE("Sprout"));
    expect((await getRankTitleForLevel(9))?.title).toEqual(TITLE("Sprout"));
    expect((await getRankTitleForLevel(10))?.title).toEqual(TITLE("Bloom"));
    expect((await getRankTitleForLevel(999))?.title).toEqual(TITLE("Bloom"));
  });

  it("returns null when every row's minLevel is above the given level", async () => {
    await insertRankTitle({ minLevel: 20, title: TITLE("Legend") });

    // 0, not 1: earlier tests in this file already seed a minLevel: 1 row,
    // and rows persist across tests in this file (no per-test isolation) -
    // 0 is below every minLevel any test in this file ever inserts.
    expect(await getRankTitleForLevel(0)).toBeNull();
  });

  it("rejects a duplicate minLevel at the database level", async () => {
    await insertRankTitle({ minLevel: 30, title: TITLE("First") });

    await expect(insertRankTitle({ minLevel: 30, title: TITLE("Second") })).rejects.toThrow();
  });

  it("listRankTitles returns every row ordered by minLevel ascending", async () => {
    await insertRankTitle({ minLevel: 47, title: TITLE("High") });
    await insertRankTitle({ minLevel: 41, title: TITLE("Low") });

    const rows = await listRankTitles();
    const levels = rows.map((r) => r.minLevel).filter((n) => n === 47 || n === 41);
    expect(levels).toEqual([41, 47]);
  });

  it("updateRankTitleRow updates in place, not a new row", async () => {
    const created = await insertRankTitle({ minLevel: 55, title: TITLE("Old") });

    const updated = await updateRankTitleRow(created.id, { minLevel: 55, title: TITLE("New") });

    expect(updated?.id).toBe(created.id);
    expect(updated?.title).toEqual(TITLE("New"));
  });

  it("deleteRankTitleRow removes the row and returns it", async () => {
    const created = await insertRankTitle({ minLevel: 60, title: TITLE("Gone") });

    const deleted = await deleteRankTitleRow(created.id);
    expect(deleted?.id).toBe(created.id);
    expect(await getRankTitleForLevel(60)).not.toMatchObject({ id: created.id });
  });

  it("deleteRankTitleRow returns null for an id that doesn't exist", async () => {
    expect(await deleteRankTitleRow("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
