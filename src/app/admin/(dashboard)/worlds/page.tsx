import { Globe2 } from "lucide-react";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { getStaffMember } from "@/lib/auth";
import { DB_CONCURRENCY_LIMIT, runWithConcurrencyLimit } from "@/lib/concurrency-limit";
import { paginateRows, readPageParams } from "@/lib/admin/paginate";
import { roleHasPermission } from "@/server/staff/repo";
import { getMentorEditorData } from "@/server/mentors/service";
import { getLessonEditorData } from "@/server/lessons/service";
import { getWorldEditorData } from "@/server/worlds/service";
import { WorldEditor } from "./world-editor";

type WorldRow = Awaited<ReturnType<typeof getWorldEditorData>>[number];

// Server-side sort comparators for the Worlds table (Task 2: search/sort/
// pagination for admin "small catalog" lists, state in URL params - see
// src/lib/admin/paginate.ts). Kept here, not in src/server/worlds/*, since
// this is purely an admin-list-display concern over data getWorldEditorData()
// already returns unchanged - not a new repo/service query, so it stays out
// of the files /api/v1 shares with this domain.
const WORLD_SORT_COMPARATORS: Record<string, (a: WorldRow, b: WorldRow) => number> = {
  order: (a, b) => a.order - b.order,
  code: (a, b) => (a.code ?? "").localeCompare(b.code ?? ""),
  title: (a, b) => a.title.en.localeCompare(b.title.en),
  status: (a, b) => a.status.localeCompare(b.status),
};

// Searches every language, not just en - a staff member fluent in Hindi
// typing a Hindi title shouldn't come up empty.
function worldSearchText(w: WorldRow): string {
  return `${w.code ?? ""} ${w.title.en} ${w.title.hi} ${w.title.hx} ${w.theme} ${w.status}`;
}

type StatusFilter = "draft" | "published" | null;

function parseStatusFilter(raw: string | string[] | undefined): StatusFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "draft" || value === "published" ? value : null;
}

export default async function WorldsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const [canManage, canPublish] = await Promise.all([
    roleHasPermission(staff.roleId, "world.manage"),
    roleHasPermission(staff.roleId, "world.publish"),
  ]);
  if (!canManage && !canPublish) {
    return <Forbidden message="You don't have permission to manage worlds." />;
  }

  const [worlds, mentors] = await Promise.all([
    getWorldEditorData(),
    getMentorEditorData(),
  ]);

  const params = searchParams ? await searchParams : {};
  const pageState = readPageParams(params, {
    defaultSort: "order",
    allowedSorts: Object.keys(WORLD_SORT_COMPARATORS),
  });
  const statusFilter = parseStatusFilter(params.status);

  const paged = paginateRows(worlds, {
    search: pageState.q,
    searchText: worldSearchText,
    filter: statusFilter ? (w) => w.status === statusFilter : undefined,
    sort: pageState.sort,
    dir: pageState.dir,
    comparators: WORLD_SORT_COMPARATORS,
    page: pageState.page,
    pageSize: pageState.pageSize,
  });

  // Doubt Zone lessons per world, for the mentor-change warning below (see
  // docs/ARCHITECTURE.md D19) - scoped to only the worlds on THIS page now
  // that the table is paginated: a staff member can only select one of
  // those for editing, so there's nothing to compute for a world that
  // isn't currently shown. runWithConcurrencyLimit, not a bare Promise.all
  // (CLAUDE.md rule 15, docs/ARCHITECTURE.md D13/D72): still a loop of real
  // Postgres reads, even bounded to one page.
  const lessonsByWorld = await runWithConcurrencyLimit(
    paged.rows.map((w) => () => getLessonEditorData(w.id)),
    DB_CONCURRENCY_LIMIT,
  );
  const doubtZoneLessonsByWorldId: Record<
    string,
    {
      id: string;
      title: { en: string; hi: string; hx: string };
      mentorKey: string;
    }[]
  > = {};
  paged.rows.forEach((w, i) => {
    doubtZoneLessonsByWorldId[w.id] = lessonsByWorld[i]!.filter(
      (l) => l.kind === "doubt_zone",
    ).map((l) => ({
      id: l.id,
      title: l.title,
      mentorKey:
        typeof l.content === "object" && l.content !== null
          ? String((l.content as Record<string, unknown>).mentorKey ?? "")
          : "",
    }));
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Worlds" },
        ]}
        icon={Globe2}
        title="Worlds"
        description="Worlds a learner clears in sequential order - staff decide how many exist. Publish is blocked until every en/hi/hx field is filled, and until the world's mentor is itself published. A mentor can't be unpublished while a published world still references it. A world can only be deleted once it has no lessons."
      />

      <WorldEditor
        worlds={paged.rows.map((w) => ({
          id: w.id,
          order: w.order,
          code: w.code,
          title: w.title,
          tagline: w.tagline,
          theme: w.theme,
          displayXpTarget: w.displayXpTarget,
          mentorId: w.mentorId,
          status: w.status,
          artUrl: w.artUrl,
        }))}
        mentors={mentors.map((m) => ({
          id: m.id,
          key: m.key,
          name: m.name,
          status: m.status,
        }))}
        doubtZoneLessonsByWorldId={doubtZoneLessonsByWorldId}
        canManage={canManage}
        canPublish={canPublish}
        total={paged.total}
        page={paged.page}
        pageCount={paged.pageCount}
        pageSize={paged.pageSize}
        q={pageState.q}
        sort={pageState.sort}
        dir={pageState.dir}
        status={statusFilter}
      />
    </div>
  );
}
