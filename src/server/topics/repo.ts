import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { topics } from "@/db/schema";
import type { LocalizedText } from "@/db/schema/_helpers";

export async function listTopics() {
  return db.select().from(topics).orderBy(asc(topics.order));
}

// Learner/app-facing and cross-domain lookups (news drafting, question
// authoring pickers) only ever need the active set, in display order.
export async function listActiveTopics() {
  return db.select().from(topics).where(eq(topics.active, true)).orderBy(asc(topics.order));
}

export async function getTopicById(id: string) {
  const [row] = await db.select().from(topics).where(eq(topics.id, id)).limit(1);
  return row ?? null;
}

export async function insertTopic(input: { order: number; name: LocalizedText; active: boolean }) {
  const [row] = await db.insert(topics).values(input).returning();
  return row;
}

export async function updateTopicRow(
  id: string,
  input: { order: number; name: LocalizedText; active: boolean },
) {
  const [row] = await db.update(topics).set(input).where(eq(topics.id, id)).returning();
  return row ?? null;
}
