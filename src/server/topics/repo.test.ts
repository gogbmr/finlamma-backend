// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - never touches the real Supabase database (see @/db/client's
// NODE_ENV=test guard). Proves the (order) unique index and the
// active-only filter actually hold at the database level.
import { afterAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const { getTopicById, insertTopic, listActiveTopics, listTopics, updateTopicRow } = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

const NAME = (word: string) => ({ en: word, hi: word, hx: word });

describe("topics", () => {
  it("insertTopic creates a row, active by default only if passed explicitly", async () => {
    const created = await insertTopic({ order: 1, name: NAME("RBI & Rates"), active: true });
    expect(created.name).toEqual(NAME("RBI & Rates"));
    expect(created.active).toBe(true);
  });

  it("rejects a duplicate order at the database level", async () => {
    await insertTopic({ order: 30, name: NAME("First"), active: true });

    await expect(insertTopic({ order: 30, name: NAME("Second"), active: true })).rejects.toThrow();
  });

  it("listTopics returns every row ordered by order ascending, regardless of active", async () => {
    await insertTopic({ order: 47, name: NAME("High"), active: true });
    await insertTopic({ order: 41, name: NAME("Low"), active: false });

    const rows = await listTopics();
    const orders = rows.map((r) => r.order).filter((n) => n === 47 || n === 41);
    expect(orders).toEqual([41, 47]);
  });

  it("listActiveTopics excludes inactive rows", async () => {
    await insertTopic({ order: 50, name: NAME("Active"), active: true });
    await insertTopic({ order: 51, name: NAME("Inactive"), active: false });

    const rows = await listActiveTopics();
    expect(rows.some((r) => r.order === 50)).toBe(true);
    expect(rows.some((r) => r.order === 51)).toBe(false);
  });

  it("updateTopicRow updates in place, not a new row", async () => {
    const created = await insertTopic({ order: 55, name: NAME("Old"), active: true });

    const updated = await updateTopicRow(created.id, { order: 55, name: NAME("New"), active: false });

    expect(updated?.id).toBe(created.id);
    expect(updated?.name).toEqual(NAME("New"));
    expect(updated?.active).toBe(false);
  });

  it("updateTopicRow returns null for an id that doesn't exist", async () => {
    expect(await updateTopicRow("00000000-0000-0000-0000-000000000000", { order: 1, name: NAME("x"), active: true })).toBeNull();
  });

  it("getTopicById returns null for an id that doesn't exist", async () => {
    expect(await getTopicById("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
