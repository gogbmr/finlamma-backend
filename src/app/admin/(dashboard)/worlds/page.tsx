import { Globe2 } from "lucide-react";
import Link from "next/link";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { getStaffMember } from "@/lib/auth";
import { paginateRows, readPageParams } from "@/lib/admin/paginate";
import { getPermissionKeysForRole } from "@/server/staff/repo";
import { getMentorEditorData } from "@/server/mentors/service";
import { getWorldEditorData } from "@/server/worlds/service";
import { AdminGlassBackground, glassPanel } from "@/components/admin/glass";
import { WorldsTable } from "./worlds-table";

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

  const grantedKeys = await getPermissionKeysForRole(staff.roleId);
  const canCreate = grantedKeys.has("world.create");
  const canEdit = grantedKeys.has("world.edit");
  const canDelete = grantedKeys.has("world.delete");
  if (!grantedKeys.has("world.view")) {
    return <Forbidden message="You don't have permission to view worlds." />;
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

  return (
    <AdminGlassBackground>
      <div className="space-y-3">
        <div className={glassPanel("px-5 py-4")}>
          <PageHeader
            breadcrumbs={[
              { label: "Admin", href: "/admin" },
              { label: "Worlds" },
            ]}
            icon={Globe2}
            title="Worlds"
            action={
              canCreate && (
                <Button asChild size="sm">
                  <Link href="/admin/worlds/new">+ New world</Link>
                </Button>
              )
            }
          />
        </div>

        <WorldsTable
          rows={paged.rows.map((w) => ({
            id: w.id,
            order: w.order,
            code: w.code,
            title: w.title,
            status: w.status,
            mentorId: w.mentorId,
          }))}
          mentors={mentors.map((m) => ({
            id: m.id,
            key: m.key,
            name: m.name,
          }))}
          total={paged.total}
          page={paged.page}
          pageCount={paged.pageCount}
          pageSize={paged.pageSize}
          q={pageState.q}
          sort={pageState.sort}
          dir={pageState.dir}
          status={statusFilter}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </div>
    </AdminGlassBackground>
  );
}
