import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { requireStaff } from "@/lib/auth";
import { getLessonFlowScoringSettings } from "@/server/settings/service";
import { ScoringSettingsEditor } from "./scoring-settings-editor";

export default async function SettingsPage() {
  try {
    await requireStaff("settings.manage");
  } catch {
    return <Forbidden message="You don't have permission to manage settings. Only super_admin does." />;
  }

  const scoring = await getLessonFlowScoringSettings();

  return (
    <div className="space-y-8">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin/staff" }, { label: "Settings" }]}
        title="Settings"
        description="Admin-tunable constants that affect every learner immediately. Every change is logged."
      />

      <ScoringSettingsEditor scoring={scoring} />
    </div>
  );
}
