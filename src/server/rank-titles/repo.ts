import { desc, eq, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { rankTitles } from "@/db/schema";
import type { LocalizedText } from "@/db/schema/_helpers";

export async function listRankTitles() {
  return db.select().from(rankTitles).orderBy(rankTitles.minLevel);
}

export async function getRankTitleById(id: string) {
  const [row] = await db.select().from(rankTitles).where(eq(rankTitles.id, id)).limit(1);
  return row ?? null;
}

// The title shown on a learner's level ring (PR-01): the highest minLevel
// that's still <= their current level. Returns null if the table is empty
// or every row's minLevel is above this level (e.g. the ladder starts at 5
// and the learner is level 1) - callers show no rank title rather than
// erroring, since this is entirely cosmetic.
export async function getRankTitleForLevel(level: number) {
  const [row] = await db
    .select()
    .from(rankTitles)
    .where(lte(rankTitles.minLevel, level))
    .orderBy(desc(rankTitles.minLevel))
    .limit(1);
  return row ?? null;
}

export async function insertRankTitle(input: { minLevel: number; title: LocalizedText }) {
  const [row] = await db.insert(rankTitles).values(input).returning();
  return row;
}

export async function updateRankTitleRow(
  id: string,
  input: { minLevel: number; title: LocalizedText },
) {
  const [row] = await db
    .update(rankTitles)
    .set(input)
    .where(eq(rankTitles.id, id))
    .returning();
  return row ?? null;
}

export async function deleteRankTitleRow(id: string) {
  const [row] = await db.delete(rankTitles).where(eq(rankTitles.id, id)).returning();
  return row ?? null;
}
