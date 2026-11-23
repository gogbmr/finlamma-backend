import { Gift } from "lucide-react";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { getStaffMember } from "@/lib/auth";
import { paginateRows, readPageParams } from "@/lib/admin/paginate";
import { getPermissionKeysForRole } from "@/server/staff/repo";
import { getRewardEditorData, listRecentClaimsForAdmin } from "@/server/rewards/service";
import { RewardEditor } from "./reward-editor";
import { RecentClaims } from "./recent-claims";

type RewardRow = Awaited<ReturnType<typeof getRewardEditorData>>[number];

// Task 3a: same pattern as Worlds/Mentors/Badges - see
// src/lib/admin/paginate.ts. getRewardEditorData() itself is unchanged;
// listRecentClaimsForAdmin()/RecentClaims (a separate audit list) is out of
// scope for this round.
const REWARD_SORT_COMPARATORS: Record<string, (a: RewardRow, b: RewardRow) => number> = {
  name: (a, b) => a.name.en.localeCompare(b.name.en),
  category: (a, b) => a.category.localeCompare(b.category),
  priceVm: (a, b) => a.priceVm - b.priceVm,
  status: (a, b) => a.status.localeCompare(b.status),
};

function rewardSearchText(r: RewardRow): string {
  return `${r.name.en} ${r.name.hi} ${r.name.hx} ${r.category}`;
}

type StatusFilter = "draft" | "published" | null;

function parseStatusFilter(raw: string | string[] | undefined): StatusFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "draft" || value === "published" ? value : null;
}

export default async function RewardsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const grantedKeys = await getPermissionKeysForRole(staff.roleId);
  const canCreate = grantedKeys.has("reward.create");
  const canEdit = grantedKeys.has("reward.edit");
  if (!grantedKeys.has("reward.view")) {
    return <Forbidden message="You don't have permission to view rewards. Only super_admin does." />;
  }

  const [rewards, recentClaims] = await Promise.all([getRewardEditorData(), listRecentClaimsForAdmin()]);

  const params = searchParams ? await searchParams : {};
  const pageState = readPageParams(params, {
    allowedSorts: Object.keys(REWARD_SORT_COMPARATORS),
  });
  const statusFilter = parseStatusFilter(params.status);

  const paged = paginateRows(rewards, {
    search: pageState.q,
    searchText: rewardSearchText,
    filter: statusFilter ? (r) => r.status === statusFilter : undefined,
    sort: pageState.sort,
    dir: pageState.dir,
    comparators: REWARD_SORT_COMPARATORS,
    page: pageState.page,
    pageSize: pageState.pageSize,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Rewards" }]}
        icon={Gift}
        title="Rewards"
        description="A learner can claim each reward at most once. Price is fixed and admin-set - never computed from the viewing learner's own balance. Publish is blocked until every en/hi/hx field is filled."
      />

      <RewardEditor
        rewards={paged.rows}
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

      <RecentClaims claims={recentClaims} />
    </div>
  );
}
