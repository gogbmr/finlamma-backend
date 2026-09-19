import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "@/db/client";
import { activityLogs } from "@/db/schema";
import { encodeCursor } from "@/lib/http";

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

export type ActivityLogCursor = { createdAt: string; id: string };
export type ActorTypeFilter = "user" | "staff" | "system";

// Read side for the admin activity log viewer. Ordered newest-first by
// (created_at, id) so the cursor stays stable even when two rows share the
// same created_at timestamp. Never mutates - activity_logs has no
// update/delete path anywhere (see docs/ARCHITECTURE.md decision D12).
export async function listActivityLogs(opts: {
  limit: number;
  cursor: ActivityLogCursor | null;
  actorType?: ActorTypeFilter;
}) {
  const conditions = [];
  if (opts.actorType) conditions.push(eq(activityLogs.actorType, opts.actorType));
  if (opts.cursor) {
    const cursorCreatedAt = new Date(opts.cursor.createdAt);
    conditions.push(
      or(
        lt(activityLogs.createdAt, cursorCreatedAt),
        and(eq(activityLogs.createdAt, cursorCreatedAt), lt(activityLogs.id, opts.cursor.id)),
      ),
    );
  }

  const rows = await db
    .select()
    .from(activityLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(activityLogs.createdAt), desc(activityLogs.id))
    .limit(opts.limit + 1);

  const hasMore = rows.length > opts.limit;
  const page = hasMore ? rows.slice(0, opts.limit) : rows;
  const last = page.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id } satisfies ActivityLogCursor)
      : null;

  return { data: page, nextCursor };
}
