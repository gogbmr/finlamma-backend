import { Forbidden } from "@/components/admin/forbidden";
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
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-neutral-600">
          Admin-tunable constants that affect every learner immediately. Every change is logged.
        </p>
      </div>

      <ScoringSettingsEditor scoring={scoring} />
    </div>
  );
}
