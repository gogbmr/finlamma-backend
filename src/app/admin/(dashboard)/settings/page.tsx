import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { requireStaff } from "@/lib/auth";
import { getDailyGoalsSettings } from "@/server/daily-goals/service";
import { getVmIssuanceMultiplier, listRewardRulesForAdmin } from "@/server/economy/service";
import { getLevelCurveSettings } from "@/server/leveling/service";
import { listRankTitlesForAdmin } from "@/server/rank-titles/service";
import { getLessonFlowScoringSettings } from "@/server/settings/service";
import { roleHasPermission } from "@/server/staff/repo";
import { getStreaksSettings } from "@/server/streaks/service";
import { EconomySettingsEditor } from "./economy-settings-editor";
import { LevelCurveSettingsEditor } from "./level-curve-settings-editor";
import { DailyGoalsSettingsEditor } from "./daily-goals-settings-editor";
import { RankTitlesEditor } from "./rank-titles-editor";
import { ScoringSettingsEditor } from "./scoring-settings-editor";
import { StreaksSettingsEditor } from "./streaks-settings-editor";

export default async function SettingsPage() {
  let staff;
  try {
    staff = await requireStaff("settings.manage");
  } catch {
    return <Forbidden message="You don't have permission to manage settings. Only super_admin does." />;
  }

  // The page itself only requires settings.manage, but the reward-rules and
  // VM-multiplier editors below call actions gated on the stronger
  // economy.manage (updateRewardRuleAction/updateVmIssuanceMultiplierAction,
  // src/app/admin/(dashboard)/settings/actions.ts) - rendering them for a
  // viewer who lacks it would show live money controls that silently fail
  // on submit instead of being hidden. Both permissions are super_admin-only
  // today (scripts/seed-roles.ts), so this has no visible effect yet, but
  // it stops that from becoming a real gap if the two are ever split apart.
  const canManageEconomy = await roleHasPermission(staff.roleId, "economy.manage");

  const scoring = await getLessonFlowScoringSettings();
  const streaksSettings = await getStreaksSettings();
  const levelCurveSettings = await getLevelCurveSettings();
  const rankTitles = await listRankTitlesForAdmin();
  const dailyGoalsSettings = await getDailyGoalsSettings();

  return (
    <div className="space-y-8">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin/staff" }, { label: "Settings" }]}
        title="Settings"
        description="Admin-tunable constants that affect every learner immediately. Every change is logged."
      />

      <ScoringSettingsEditor scoring={scoring} />
      {canManageEconomy && <EconomyManagedSettings />}
      <StreaksSettingsEditor settings={streaksSettings} />
      <DailyGoalsSettingsEditor settings={dailyGoalsSettings} />
      <LevelCurveSettingsEditor settings={levelCurveSettings} />
      <RankTitlesEditor rankTitles={rankTitles} />
    </div>
  );
}

async function EconomyManagedSettings() {
  const rewardRules = await listRewardRulesForAdmin();
  const vmIssuanceMultiplier = await getVmIssuanceMultiplier();
  return <EconomySettingsEditor rewardRules={rewardRules} vmIssuanceMultiplier={vmIssuanceMultiplier} />;
}
