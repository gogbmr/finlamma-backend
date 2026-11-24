import { Pencil, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { AdminGlassBackground, glassPanel } from "@/components/admin/glass";
import { Button } from "@/components/ui/button";
import { getStaffMember } from "@/lib/auth";
import { getPermissionKeysForRole } from "@/server/staff/repo";
import { getMentorEditorData } from "@/server/mentors/service";
import { MentorView } from "../mentor-view";

export default async function MentorViewPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const grantedKeys = await getPermissionKeysForRole(staff.roleId);
  if (!grantedKeys.has("mentor.view")) {
    return <Forbidden message="You don't have permission to view mentors." />;
  }
  const canEdit = grantedKeys.has("mentor.edit");
  const canDelete = grantedKeys.has("mentor.delete");

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
              { label: mentor.name.en || "(untitled)" },
            ]}
            icon={Users}
            title={mentor.name.en || "(untitled)"}
            action={
              (canEdit || canDelete) && (
                <Button asChild size="sm">
                  <Link href={`/admin/mentors/${mentor.id}/edit`}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Link>
                </Button>
              )
            }
          />
        </div>

        <MentorView
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
        />
      </div>
    </AdminGlassBackground>
  );
}
