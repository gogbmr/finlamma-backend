import { Award } from "lucide-react";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { getStaffMember } from "@/lib/auth";
import { paginateRows, readPageParams } from "@/lib/admin/paginate";
import { getPermissionKeysForRole } from "@/server/staff/repo";
import { getBadgeEditorData } from "@/server/badges/service";
import { BadgeEditor } from "./badge-editor";

type BadgeRow = Awaited<ReturnType<typeof getBadgeEditorData>>[number];

// Task 3a: same pattern as Worlds/Mentors - see src/lib/admin/paginate.ts.
// getBadgeEditorData() itself is unchanged.
const BADGE_SORT_COMPARATORS: Record<string, (a: BadgeRow, b: BadgeRow) => number> = {
  name: (a, b) => a.name.en.localeCompare(b.name.en),
  category: (a, b) => a.category.localeCompare(b.category),
  vmReward: (a, b) => a.vmReward - b.vmReward,
  status: (a, b) => a.status.localeCompare(b.status),
};

function badgeSearchText(b: BadgeRow): string {
  return `${b.name.en} ${b.name.hi} ${b.name.hx} ${b.category}`;
}

type StatusFilter = "draft" | "published" | null;

function parseStatusFilter(raw: string | string[] | undefined): StatusFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "draft" || value === "published" ? value : null;
}

export default async function BadgesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const grantedKeys = await getPermissionKeysForRole(staff.roleId);
  const canCreate = grantedKeys.has("badge.create");
  const canEdit = grantedKeys.has("badge.edit");
  if (!grantedKeys.has("badge.view")) {
    return <Forbidden message="You don't have permission to view badges. Only super_admin does." />;
  }

  const badges = await getBadgeEditorData();

  const params = searchParams ? await searchParams : {};
  const pageState = readPageParams(params, {
    allowedSorts: Object.keys(BADGE_SORT_COMPARATORS),
  });
  const statusFilter = parseStatusFilter(params.status);

  const paged = paginateRows(badges, {
    search: pageState.q,
    searchText: badgeSearchText,
    filter: statusFilter ? (b) => b.status === statusFilter : undefined,
    sort: pageState.sort,
    dir: pageState.dir,
    comparators: BADGE_SORT_COMPARATORS,
    page: pageState.page,
    pageSize: pageState.pageSize,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Badges" }]}
        icon={Award}
        title="Badges"
        description="Badges pay V Money on unlock, once per learner, automatically evaluated after every real lesson credit. Publish is blocked until every en/hi/hx field is filled."
      />

      <BadgeEditor
        badges={paged.rows}
        canCreate={canCreate}
        canEdit={canEdit}
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
