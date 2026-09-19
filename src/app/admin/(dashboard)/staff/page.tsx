import { Forbidden } from "@/components/admin/forbidden";
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
      <div>
        <h1 className="text-xl font-semibold">Staff</h1>
        <p className="text-sm text-neutral-600">
          Manage who has access to this admin dashboard. New staff first sign in once at{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">/admin/sign-in</code>,
          then share their Clerk user ID with a super admin to add here.
        </p>
      </div>

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
