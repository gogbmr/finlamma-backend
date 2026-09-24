import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { getStaffMember } from "@/lib/auth";
import { roleHasPermission } from "@/server/staff/repo";
import { getBadgeEditorData } from "@/server/badges/service";
import { BadgeEditor } from "./badge-editor";

export default async function BadgesPage() {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const canManage = await roleHasPermission(staff.roleId, "economy.manage");
  if (!canManage) {
    return <Forbidden message="You don't have permission to manage badges. Only super_admin does." />;
  }

  const badges = await getBadgeEditorData();

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin/staff" }, { label: "Badges" }]}
        title="Badges"
        description="Badges pay V Money on unlock, once per learner, automatically evaluated after every real lesson credit. Publish is blocked until every en/hi/hx field is filled."
      />

      <BadgeEditor badges={badges} canManage={canManage} />
    </div>
  );
}
