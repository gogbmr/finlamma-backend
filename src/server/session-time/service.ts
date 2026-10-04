import { captureEvent } from "@/lib/analytics";
import { logActivity } from "@/lib/activity-log";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import { istDateString } from "@/lib/ist-date";
import { addSessionSeconds, getSessionSecondsForDate } from "./repo";

type RequestMeta = ReturnType<typeof requestMeta>;

// A single session-end ping is capped at 1 hour - a sane upper bound for one
// continuous lesson/screen session, not an anti-cheat measure (this table
// isn't reward-bearing - see src/db/schema/session_time.ts). Rejects rather
// than silently clamping, so a buggy client finds out immediately instead
// of quietly reporting wrong numbers forever.
const MAX_SESSION_SECONDS = 60 * 60;

export async function recordSessionTime(
  user: { id: string },
  seconds: number,
  meta: RequestMeta,
  at: Date = new Date(),
): Promise<{ todaySeconds: number }> {
  if (!Number.isInteger(seconds) || seconds <= 0 || seconds > MAX_SESSION_SECONDS) {
    throw new AppError("VALIDATION_FAILED", `seconds must be between 1 and ${MAX_SESSION_SECONDS}`);
  }
  const row = await addSessionSeconds(user.id, istDateString(at), seconds);
  await logActivity({
    actorType: "user",
    actorId: user.id,
    action: "session_time.recorded",
    targetType: "user",
    targetId: user.id,
    metadata: { seconds, todaySeconds: row.seconds },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  // DAU/WAU/MAU base unit (docs/ARCHITECTURE.md D69) - this is the only
  // session-boundary signal the backend has (a client-reported session-end
  // ping), used as the proxy for "a session happened" rather than a true
  // session-start event.
  captureEvent(user.id, "session_started");
  return { todaySeconds: row.seconds };
}

export async function getTodaySessionSeconds(userId: string, at: Date = new Date()): Promise<number> {
  return getSessionSecondsForDate(userId, istDateString(at));
}
