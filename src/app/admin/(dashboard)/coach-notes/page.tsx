import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { getStaffMember } from "@/lib/auth";
import { roleHasPermission } from "@/server/staff/repo";
import { getCoachNoteTemplateEditorData } from "@/server/report-card/service";
import { CoachNoteEditor } from "./coach-note-editor";

export default async function CoachNotesPage() {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const [canManage, canPublish] = await Promise.all([
    roleHasPermission(staff.roleId, "coach_note.manage"),
    roleHasPermission(staff.roleId, "coach_note.publish"),
  ]);
  if (!canManage && !canPublish) {
    return (
      <Forbidden message="You don't have permission to manage coach note templates. Only super_admin does." />
    );
  }

  const templates = await getCoachNoteTemplateEditorData();

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin/staff" }, { label: "Coach Notes" }]}
        title="Coach note templates"
        description="One published template per category is picked at random to fill in a learner's weekly report card, with their own numbers substituted for the {{placeholders}}."
      />

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Tone rule (docs/ARCHITECTURE.md D34)</p>
        <p className="mt-1">
          Every template must be encouraging and age-appropriate. Never shaming, never
          pressuring, and never comparative - a coach note must never read as a rank or a
          comparison against other learners, only this learner&apos;s own progress. This applies
          to en, hi and hx wording alike.
        </p>
      </div>

      <CoachNoteEditor templates={templates} canManage={canManage} canPublish={canPublish} />
    </div>
  );
}
