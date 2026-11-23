import { BookOpen, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { getStaffMember } from "@/lib/auth";
import { getPermissionKeysForRole } from "@/server/staff/repo";
import { findLessonById } from "../find-lesson";
import { LessonView } from "../lesson-view";

export default async function LessonViewPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const grantedKeys = await getPermissionKeysForRole(staff.roleId);
  if (!grantedKeys.has("lesson.view")) {
    return <Forbidden message="You don't have permission to view lessons." />;
  }
  const canEdit = grantedKeys.has("lesson.edit");
  const canDelete = grantedKeys.has("lesson.delete");

  const { id } = await params;
  const found = await findLessonById(id);
  if (!found) notFound();
  const { lesson, world } = found;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Lessons", href: `/admin/lessons?worldId=${world.id}` },
          { label: lesson.title.en || "(untitled)" },
        ]}
        icon={BookOpen}
        title={lesson.title.en || "(untitled)"}
        description="Read-only view. Use Edit to change this lesson."
        action={
          (canEdit || canDelete) && (
            <Button asChild size="sm">
              <Link href={`/admin/lessons/${lesson.id}/edit`}>
                <Pencil className="h-4 w-4" /> Edit
              </Link>
            </Button>
          )
        }
      />

      <LessonView lesson={lesson} worldTitle={world.title} />
    </div>
  );
}
