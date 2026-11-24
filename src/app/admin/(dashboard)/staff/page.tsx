import { Users } from "lucide-react";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { AdminGlassBackground, glassPanel } from "@/components/admin/glass";
import { requireStaff } from "@/lib/auth";
import { paginateRows, readPageParams } from "@/lib/admin/paginate";
import { getPermissionKeysForRole } from "@/server/staff/repo";
import { getStaffPageData } from "@/server/staff/service";
import { AddStaffForm } from "./add-staff-form";
import { StaffTable } from "./staff-table";

type StaffMemberRow = Awaited<ReturnType<typeof getStaffPageData>>["staff"][number];

// Task 3a: "align" ask - Staff already used DataTable (no master-detail
// form to guard, every row edits inline via its own Select/Button), so
// this only adds the same server-side search/sort/pagination pattern as
// the other small catalogs - see src/lib/admin/paginate.ts.
// getStaffPageData() itself is unchanged.
const STAFF_SORT_COMPARATORS: Record<string, (a: StaffMemberRow, b: StaffMemberRow) => number> = {
  clerkUserId: (a, b) => a.clerkUserId.localeCompare(b.clerkUserId),
  roleName: (a, b) => a.roleName.localeCompare(b.roleName),
};

function staffSearchText(s: StaffMemberRow): string {
  return `${s.clerkUserId} ${s.roleName}`;
}

type ActiveFilter = "active" | "inactive" | null;

function parseActiveFilter(raw: string | string[] | undefined): ActiveFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "active" || value === "inactive" ? value : null;
}

export default async function StaffPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  let viewer;
  try {
    viewer = await requireStaff("staff.view");
  } catch {
    return <Forbidden message="You don't have permission to view staff." />;
  }

  const grantedKeys = await getPermissionKeysForRole(viewer.roleId);
  const canCreate = grantedKeys.has("staff.create");
  const canEdit = grantedKeys.has("staff.edit");
  const canDelete = grantedKeys.has("staff.delete");

  const { staff, roles } = await getStaffPageData();
  const roleOptions = roles.map((r) => ({ id: r.id, name: r.name }));

  const params = searchParams ? await searchParams : {};
  const pageState = readPageParams(params, {
    allowedSorts: Object.keys(STAFF_SORT_COMPARATORS),
  });
  const activeFilter = parseActiveFilter(params.active);

  const paged = paginateRows(staff, {
    search: pageState.q,
    searchText: staffSearchText,
    filter: activeFilter ? (s) => s.active === (activeFilter === "active") : undefined,
    sort: pageState.sort,
    dir: pageState.dir,
    comparators: STAFF_SORT_COMPARATORS,
    page: pageState.page,
    pageSize: pageState.pageSize,
  });

  return (
    <AdminGlassBackground>
      <div className="space-y-3">
        <div className={glassPanel("px-5 py-4")}>
          <PageHeader
            breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Staff" }]}
            icon={Users}
            title="Staff"
          />
        </div>

        {canCreate && <AddStaffForm roles={roleOptions} />}

        <StaffTable
          staff={paged.rows.map((s) => ({
            id: s.id,
            clerkUserId: s.clerkUserId,
            active: s.active,
            roleId: s.roleId,
            roleName: s.roleName,
            email: s.email,
            gender: s.gender,
            phone: s.phone,
            address: s.address,
            photoUrl: s.photoUrl,
          }))}
          roles={roleOptions}
          total={paged.total}
          page={paged.page}
          pageCount={paged.pageCount}
          pageSize={paged.pageSize}
          q={pageState.q}
          sort={pageState.sort}
          dir={pageState.dir}
          active={activeFilter}
          viewerId={viewer.id}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </div>
    </AdminGlassBackground>
  );
}
