import { BookOpen } from "lucide-react";
import { notFound } from "next/navigation";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { AdminGlassBackground, glassPanel } from "@/components/admin/glass";
import { getStaffMember } from "@/lib/auth";
import { getPermissionKeysForRole } from "@/server/staff/repo";
import { getMentorEditorData } from "@/server/mentors/service";
import { findLessonById } from "../../find-lesson";
import { LessonForm } from "../../lesson-editor";

export default async function EditLessonPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const grantedKeys = await getPermissionKeysForRole(staff.roleId);
  const canEdit = grantedKeys.has("lesson.edit");
  const canDelete = grantedKeys.has("lesson.delete");
  if (!canEdit && !canDelete) {
    return <Forbidden message="You don't have permission to edit lessons." />;
  }

  const { id } = await params;
  const found = await findLessonById(id);
  if (!found) notFound();
  const { lesson, world } = found;

  // The world's *current* mentor - compared against this lesson's own
  // content.mentorKey (fixed at authoring time) to warn staff when they've
  // drifted apart. See docs/ARCHITECTURE.md D19. Only fetched for this one
  // lesson's world now, not every world on the old list page.
  const mentors = await getMentorEditorData();
  const worldMentorKey = mentors.find((m) => m.id === world.mentorId)?.key ?? null;

  return (
    <AdminGlassBackground>
      <div className="space-y-3">
        <div className={glassPanel("px-5 py-4")}>
          <PageHeader
            breadcrumbs={[
              { label: "Admin", href: "/admin" },
              { label: "Lessons", href: `/admin/lessons?worldId=${world.id}` },
              { label: lesson.title.en || "(untitled)", href: `/admin/lessons/${lesson.id}` },
              { label: "Edit" },
            ]}
            icon={BookOpen}
            title={`Edit ${lesson.title.en || "(untitled)"}`}
          />
        </div>

        <LessonForm
          worldTitle={world.title}
          worldMentorKey={worldMentorKey}
          lesson={lesson}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </div>
    </AdminGlassBackground>
  );
}
