import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { requireStaff } from "@/lib/auth";
import { getVmIssuanceMultiplier, listRewardRulesForAdmin } from "@/server/economy/service";
import { getLessonFlowScoringSettings } from "@/server/settings/service";
import { EconomySettingsEditor } from "./economy-settings-editor";
import { ScoringSettingsEditor } from "./scoring-settings-editor";

export default async function SettingsPage() {
  try {
    await requireStaff("settings.manage");
  } catch {
    return <Forbidden message="You don't have permission to manage settings. Only super_admin does." />;
  }

  const scoring = await getLessonFlowScoringSettings();
  const rewardRules = await listRewardRulesForAdmin();
  const vmIssuanceMultiplier = await getVmIssuanceMultiplier();

  return (
    <div className="space-y-8">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin/staff" }, { label: "Settings" }]}
        title="Settings"
        description="Admin-tunable constants that affect every learner immediately. Every change is logged."
      />

      <ScoringSettingsEditor scoring={scoring} />
      <EconomySettingsEditor rewardRules={rewardRules} vmIssuanceMultiplier={vmIssuanceMultiplier} />
    </div>
  );
}
