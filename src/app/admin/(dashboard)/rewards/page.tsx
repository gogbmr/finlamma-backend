import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { getStaffMember } from "@/lib/auth";
import { roleHasPermission } from "@/server/staff/repo";
import { getRewardEditorData, listRecentClaimsForAdmin } from "@/server/rewards/service";
import { RewardEditor } from "./reward-editor";
import { RecentClaims } from "./recent-claims";

export default async function RewardsPage() {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const canManage = await roleHasPermission(staff.roleId, "economy.manage");
  if (!canManage) {
    return <Forbidden message="You don't have permission to manage rewards. Only super_admin does." />;
  }

  const [rewards, recentClaims] = await Promise.all([getRewardEditorData(), listRecentClaimsForAdmin()]);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin/staff" }, { label: "Rewards" }]}
        title="Rewards"
        description="A learner can claim each reward at most once. Price is fixed and admin-set - never computed from the viewing learner's own balance. Publish is blocked until every en/hi/hx field is filled."
      />

      <RewardEditor rewards={rewards} canManage={canManage} />

      <RecentClaims claims={recentClaims} />
    </div>
  );
}
