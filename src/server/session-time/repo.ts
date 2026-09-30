import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { sessionTimeDaily } from "@/db/schema";

// Upsert-increment: a session-end ping ADDS to today's running total, never
// replaces it - a learner naturally sends several pings across a day (one
// per lesson/screen session). Idempotency isn't attempted here (a
// duplicate/retried ping just adds twice) since this is a display-only
// signal with no XP/VM riding on it - see src/db/schema/session_time.ts's
// comment on the trust tier this table lives at.
export async function addSessionSeconds(userId: string, dateIst: string, seconds: number) {
  const [row] = await db
    .insert(sessionTimeDaily)
    .values({ userId, dateIst, seconds })
    .onConflictDoUpdate({
      target: [sessionTimeDaily.userId, sessionTimeDaily.dateIst],
      set: { seconds: sql`${sessionTimeDaily.seconds} + ${seconds}` },
    })
    .returning();
  return row;
}

export async function getSessionSecondsForDate(userId: string, dateIst: string): Promise<number> {
  const [row] = await db
    .select({ seconds: sessionTimeDaily.seconds })
    .from(sessionTimeDaily)
    .where(and(eq(sessionTimeDaily.userId, userId), eq(sessionTimeDaily.dateIst, dateIst)))
    .limit(1);
  return row?.seconds ?? 0;
}

// Phase 7's session_goal push notification candidate set: everyone with a
// session-time ping today. An imperfect proxy for "active today" (a learner
// who somehow completes a lesson_completed-type goal with zero session-time
// pings would be missed), accepted because real usage practically always
// generates a ping - a precise "any activity at all" query would need to
// union several other domains' tables for one notification's candidate
// list.
export async function listUserIdsActiveOnDate(dateIst: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: sessionTimeDaily.userId })
    .from(sessionTimeDaily)
    .where(eq(sessionTimeDaily.dateIst, dateIst));
  return rows.map((r) => r.userId);
}
