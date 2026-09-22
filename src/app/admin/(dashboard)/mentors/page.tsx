import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { getStaffMember } from "@/lib/auth";
import { roleHasPermission } from "@/server/staff/repo";
import { getMentorEditorData } from "@/server/mentors/service";
import { MentorEditor } from "./mentor-editor";

export default async function MentorsPage() {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const [canManage, canPublish] = await Promise.all([
    roleHasPermission(staff.roleId, "mentor.manage"),
    roleHasPermission(staff.roleId, "mentor.publish"),
  ]);
  if (!canManage && !canPublish) {
    return <Forbidden message="You don't have permission to manage mentors." />;
  }

  const mentors = await getMentorEditorData();

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin/staff" }, { label: "Mentors" }]}
        title="Mentors"
        description="Any number of Lamma mentors, assigned to worlds from the World editor (mentorId) - one mentor can cover many worlds. Publish is blocked until every en/hi/hx field is filled."
      />

      <MentorEditor
        mentors={mentors.map((m) => ({
          id: m.id,
          key: m.key,
          order: m.order,
          name: m.name,
          bio: m.bio,
          persona: m.persona,
          status: m.status,
          artUrl: m.artUrl,
          usedByWorlds: m.usedByWorlds,
        }))}
        canManage={canManage}
        canPublish={canPublish}
      />
    </div>
  );
}
