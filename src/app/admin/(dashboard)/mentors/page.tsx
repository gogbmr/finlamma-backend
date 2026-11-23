import { Users } from "lucide-react";
import Link from "next/link";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { getStaffMember } from "@/lib/auth";
import { paginateRows, readPageParams } from "@/lib/admin/paginate";
import { getPermissionKeysForRole } from "@/server/staff/repo";
import { getMentorEditorData } from "@/server/mentors/service";
import { MentorsTable } from "./mentors-table";

type MentorRow = Awaited<ReturnType<typeof getMentorEditorData>>[number];

// Task 3a: same server-side search/sort/pagination pattern as Worlds (Task
// 2) - see src/lib/admin/paginate.ts. getMentorEditorData() itself is
// unchanged; this only slices its result.
const MENTOR_SORT_COMPARATORS: Record<string, (a: MentorRow, b: MentorRow) => number> = {
  order: (a, b) => a.order - b.order,
  key: (a, b) => a.key.localeCompare(b.key),
  name: (a, b) => a.name.en.localeCompare(b.name.en),
  status: (a, b) => a.status.localeCompare(b.status),
};

function mentorSearchText(m: MentorRow): string {
  return `${m.key} ${m.name.en} ${m.name.hi} ${m.name.hx}`;
}

type StatusFilter = "draft" | "published" | null;

function parseStatusFilter(raw: string | string[] | undefined): StatusFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "draft" || value === "published" ? value : null;
}

export default async function MentorsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const grantedKeys = await getPermissionKeysForRole(staff.roleId);
  const canCreate = grantedKeys.has("mentor.create");
  const canEdit = grantedKeys.has("mentor.edit");
  const canDelete = grantedKeys.has("mentor.delete");
  if (!grantedKeys.has("mentor.view")) {
    return <Forbidden message="You don't have permission to view mentors." />;
  }

  const mentors = await getMentorEditorData();

  const params = searchParams ? await searchParams : {};
  const pageState = readPageParams(params, {
    defaultSort: "order",
    allowedSorts: Object.keys(MENTOR_SORT_COMPARATORS),
  });
  const statusFilter = parseStatusFilter(params.status);

  const paged = paginateRows(mentors, {
    search: pageState.q,
    searchText: mentorSearchText,
    filter: statusFilter ? (m) => m.status === statusFilter : undefined,
    sort: pageState.sort,
    dir: pageState.dir,
    comparators: MENTOR_SORT_COMPARATORS,
    page: pageState.page,
    pageSize: pageState.pageSize,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Mentors" }]}
        icon={Users}
        title="Mentors"
        description="Any number of Lamma mentors, assigned to worlds from the World editor (mentorId) - one mentor can cover many worlds. Publish is blocked until every en/hi/hx field is filled."
        action={
          canCreate && (
            <Button asChild size="sm">
              <Link href="/admin/mentors/new">+ New mentor</Link>
            </Button>
          )
        }
      />

      <MentorsTable
        rows={paged.rows.map((m) => ({ id: m.id, key: m.key, order: m.order, name: m.name, status: m.status }))}
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
  );
}
