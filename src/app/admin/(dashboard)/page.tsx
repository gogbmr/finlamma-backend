import { redirect } from "next/navigation";
import { ADMIN_LANDING_PRIORITY } from "@/components/admin/admin-nav";
import { getStaffMember } from "@/lib/auth";
import { computeAdminNavVisibility } from "@/lib/admin/nav-visibility";

// Lands a signed-in staff member on the first section their role can
// actually see, instead of a hardcoded page they might not have permission
// for - previously this always redirected to /admin/staff, which only made
// sense back when every early staff member had staff.manage. By the time
// this component runs, the parent layout.tsx has already verified the
// caller is an active staff member (it renders a dedicated "Access denied"
// panel and returns early otherwise, never {children}) - so getStaffMember()
// here is a second, cheap lookup rather than a security check of its own.
export default async function AdminHomePage() {
  const staff = await getStaffMember();
  if (!staff) redirect("/admin/sign-in");

  const visibility = await computeAdminNavVisibility(staff.roleId);
  const landing = ADMIN_LANDING_PRIORITY.find(({ key }) => visibility[key]);

  // No permission at all grants no sidebar entry either - fall back to the
  // one page every active staff member can at least load and get a clear
  // "you don't have permission" message from, rather than looping.
  redirect(landing?.href ?? "/admin/staff");
}
