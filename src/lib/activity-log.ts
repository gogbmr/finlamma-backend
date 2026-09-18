import { db } from "@/db/client";
import { activityLogs } from "@/db/schema";

type LogActivityInput = {
  actorType: "user" | "staff" | "system";
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
};

// The only way a row is ever written to activity_logs. There is
// deliberately no update or delete counterpart - the table is append-only.
export async function logActivity(input: LogActivityInput) {
  await db.insert(activityLogs).values({
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    metadata: input.metadata,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}
