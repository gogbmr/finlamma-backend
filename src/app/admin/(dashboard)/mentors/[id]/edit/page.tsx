import { Users } from "lucide-react";
import { notFound } from "next/navigation";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { AdminGlassBackground, glassPanel } from "@/components/admin/glass";
import { getStaffMember } from "@/lib/auth";
import { getPermissionKeysForRole } from "@/server/staff/repo";
import { getMentorEditorData } from "@/server/mentors/service";
import { MentorForm } from "../../mentor-editor";

export default async function EditMentorPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const grantedKeys = await getPermissionKeysForRole(staff.roleId);
  const canEdit = grantedKeys.has("mentor.edit");
  const canDelete = grantedKeys.has("mentor.delete");
  if (!canEdit && !canDelete) {
    return <Forbidden message="You don't have permission to edit mentors." />;
  }

  const { id } = await params;
  const mentors = await getMentorEditorData();
  const mentor = mentors.find((m) => m.id === id);
  if (!mentor) notFound();

  return (
    <AdminGlassBackground>
      <div className="space-y-3">
        <div className={glassPanel("px-5 py-4")}>
          <PageHeader
            breadcrumbs={[
              { label: "Admin", href: "/admin" },
              { label: "Mentors", href: "/admin/mentors" },
              { label: mentor.name.en || "(untitled)", href: `/admin/mentors/${mentor.id}` },
              { label: "Edit" },
            ]}
            icon={Users}
            title={`Edit ${mentor.name.en || "(untitled)"}`}
          />
        </div>

        <MentorForm
          mentor={{
            id: mentor.id,
            key: mentor.key,
            order: mentor.order,
            name: mentor.name,
            bio: mentor.bio,
            persona: mentor.persona,
            status: mentor.status,
            artUrl: mentor.artUrl,
            usedByWorlds: mentor.usedByWorlds,
          }}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </div>
    </AdminGlassBackground>
  );
}
