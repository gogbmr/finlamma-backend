import Link from "next/link";
import { Forbidden } from "@/components/admin/forbidden";
import { listActivityLogs, type ActivityLogCursor, type ActorTypeFilter } from "@/lib/activity-log";
import { requireStaff } from "@/lib/auth";
import { decodeCursor, DEFAULT_PAGE_LIMIT } from "@/lib/http";
import { ActivityLogTable } from "./activity-log-table";

const ACTOR_TYPES: ActorTypeFilter[] = ["user", "staff", "system"];

function isActorType(value: string | undefined): value is ActorTypeFilter {
  return ACTOR_TYPES.includes(value as ActorTypeFilter);
}

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; actorType?: string }>;
}) {
  try {
    await requireStaff("activity_log.view");
  } catch {
    return <Forbidden message="You don't have permission to view the activity log." />;
  }

  const params = await searchParams;
  const actorType = isActorType(params.actorType) ? params.actorType : undefined;
  const cursor = decodeCursor<ActivityLogCursor>(params.cursor ?? null);

  const { data, nextCursor } = await listActivityLogs({
    limit: DEFAULT_PAGE_LIMIT,
    cursor,
    actorType,
  });

  const filterHref = (type?: ActorTypeFilter) =>
    type ? `/admin/activity-log?actorType=${type}` : "/admin/activity-log";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Activity Log</h1>
        <p className="text-sm text-neutral-600">
          Append-only record of staff and user actions. Nothing here can be edited or deleted.
        </p>
      </div>

      <div className="flex gap-4 text-sm">
        <Link
          href={filterHref()}
          className={!actorType ? "font-semibold underline" : "text-neutral-600 hover:underline"}
        >
          All
        </Link>
        {ACTOR_TYPES.map((type) => (
          <Link
            key={type}
            href={filterHref(type)}
            className={
              actorType === type ? "font-semibold underline" : "text-neutral-600 hover:underline"
            }
          >
            {type}
          </Link>
        ))}
      </div>

      <ActivityLogTable
        rows={data.map((log) => ({
          id: log.id,
          createdAt: log.createdAt.toISOString(),
          actorType: log.actorType,
          actorId: log.actorId,
          action: log.action,
          targetType: log.targetType,
          targetId: log.targetId,
        }))}
      />

      {nextCursor && (
        <Link
          href={`/admin/activity-log?${actorType ? `actorType=${actorType}&` : ""}cursor=${nextCursor}`}
          className="text-sm font-medium underline"
        >
          Load more
        </Link>
      )}
    </div>
  );
}
