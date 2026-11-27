import { Globe2, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { getStaffMember } from "@/lib/auth";
import { getPermissionKeysForRole } from "@/server/staff/repo";
import { getMentorEditorData } from "@/server/mentors/service";
import { getWorldEditorData } from "@/server/worlds/service";
import { AdminGlassBackground, glassPanel } from "@/components/admin/glass";
import { WorldView } from "../world-view";

export default async function WorldViewPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const grantedKeys = await getPermissionKeysForRole(staff.roleId);
  if (!grantedKeys.has("world.view")) {
    return <Forbidden message="You don't have permission to view worlds." />;
  }
  const canEdit = grantedKeys.has("world.edit");
  const canDelete = grantedKeys.has("world.delete");

  const { id } = await params;
  const [worlds, mentors] = await Promise.all([getWorldEditorData(), getMentorEditorData()]);
  const world = worlds.find((w) => w.id === id);
  if (!world) notFound();

  const mentor = mentors.find((m) => m.id === world.mentorId) ?? null;

  return (
    <AdminGlassBackground>
      <div className="space-y-3">
        <div className={glassPanel("px-5 py-4")}>
          <PageHeader
            breadcrumbs={[
              { label: "Admin", href: "/admin" },
              { label: "Worlds", href: "/admin/worlds" },
              { label: world.title.en || "(untitled)" },
            ]}
            icon={Globe2}
            title={world.title.en || "(untitled)"}
            action={
              (canEdit || canDelete) && (
                <Button asChild size="sm">
                  <Link href={`/admin/worlds/${world.id}/edit`}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Link>
                </Button>
              )
            }
          />
        </div>

        <WorldView
          world={{
            id: world.id,
            order: world.order,
            code: world.code,
            title: world.title,
            tagline: world.tagline,
            theme: world.theme,
            displayXpTarget: world.displayXpTarget,
            mentorId: world.mentorId,
            status: world.status,
            artUrl: world.artUrl,
            cardMediaUrl: world.cardMediaUrl,
          }}
          mentor={mentor ? { id: mentor.id, key: mentor.key, name: mentor.name, status: mentor.status } : null}
        />
      </div>
    </AdminGlassBackground>
  );
}
