import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { requireStaff } from "@/lib/auth";
import { getStaffPageData } from "@/server/staff/service";
import { AddStaffForm } from "./add-staff-form";
import { StaffTable } from "./staff-table";

export default async function StaffPage() {
  try {
    await requireStaff("staff.manage");
  } catch {
    return <Forbidden message="You don't have permission to manage staff." />;
  }

  const { staff, roles } = await getStaffPageData();
  const roleOptions = roles.map((r) => ({ id: r.id, name: r.name }));

  return (
    <div className="space-y-8">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin/staff" }, { label: "Staff" }]}
        title="Staff"
        description="Manage who has access to this admin dashboard. Inviting someone sends them a Clerk invite email - they appear here automatically once they accept and sign up."
      />

      <AddStaffForm roles={roleOptions} />

      <StaffTable
        staff={staff.map((s) => ({
          id: s.id,
          clerkUserId: s.clerkUserId,
          active: s.active,
          roleId: s.roleId,
          roleName: s.roleName,
        }))}
        roles={roleOptions}
      />
    </div>
  );
}
