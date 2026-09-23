import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { streaks } from "@/db/schema";
import { daysBetweenIstDates } from "@/lib/ist-date";
import { computeStreakTransition, effectiveFreezesLeft } from "./streak-math";

export type StreakScope = "learning" | "pulse_check";

export async function getStreak(userId: string, scope: StreakScope) {
  const [row] = await db
    .select()
    .from(streaks)
    .where(and(eq(streaks.userId, userId), eq(streaks.scope, scope)))
    .limit(1);
  return row ?? null;
}

// The whole point of the row lock (docs/ARCHITECTURE.md D30): two genuine,
// separate activities for the same user landing close together (e.g.
// completing two different lessons within the same second) must never both
// see the streak as "not yet updated today" and both increment `current` -
// the second call has to see the first one's write. Idempotent: a second
// call the same IST day is a no-op (extended: false), whether or not a
// concurrent call is involved.
export async function recordStreakActivity(
  userId: string,
  scope: StreakScope,
  todayIst: string,
  freezesPerMonth: number,
) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(streaks)
      .where(and(eq(streaks.userId, userId), eq(streaks.scope, scope)))
      .for("update");

    const monthIst = todayIst.slice(0, 7);

    if (!existing) {
      const [created] = await tx
        .insert(streaks)
        .values({
          userId,
          scope,
          current: 1,
          longest: 1,
          lastActiveDateIst: todayIst,
          freezesLeft: freezesPerMonth,
          freezesResetMonth: monthIst,
        })
        .returning();
      return { ...created, extended: true };
    }

    if (existing.lastActiveDateIst === todayIst) {
      return { ...existing, extended: false };
    }

    // Lazy monthly reset: the first activity recorded in a new IST month
    // tops the allowance back up, rather than a scheduled job doing it for
    // every user at month start.
    let freezesLeft = effectiveFreezesLeft(
      existing.freezesLeft,
      existing.freezesResetMonth,
      todayIst,
      freezesPerMonth,
    );
    const freezesResetMonth = monthIst;

    const gapDays = daysBetweenIstDates(existing.lastActiveDateIst, todayIst);
    const transition = computeStreakTransition(gapDays, freezesLeft);
    let current: number;
    if (transition.kind === "extend") {
      // Either the normal consecutive-day case, or exactly one missed day
      // covered by a freeze (D30: a freeze auto-covers one missed day at a
      // time, never a multi-day gap even with more than one freeze
      // available - computeStreakTransition never returns consumesFreeze
      // for a gap bigger than 2).
      if (transition.consumesFreeze) freezesLeft -= 1;
      current = existing.current + 1;
    } else {
      // Missed 2+ days, or missed exactly one with no freeze left - the
      // streak breaks. Today's own activity still starts a fresh streak of 1.
      current = 1;
    }
    const longest = Math.max(existing.longest, current);

    const [updated] = await tx
      .update(streaks)
      .set({ current, longest, lastActiveDateIst: todayIst, freezesLeft, freezesResetMonth })
      .where(eq(streaks.id, existing.id))
      .returning();
    return { ...updated, extended: true };
  });
}
