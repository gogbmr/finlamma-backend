import { BookOpen } from "lucide-react";
import Link from "next/link";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { AdminGlassBackground, glassPanel } from "@/components/admin/glass";
import { getStaffMember } from "@/lib/auth";
import { roleHasPermission } from "@/server/staff/repo";
import { getWorldEditorData } from "@/server/worlds/service";
import { NewLessonForm } from "../lesson-editor";

export default async function NewLessonPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const canCreate = await roleHasPermission(staff.roleId, "lesson.create");
  if (!canCreate) {
    return <Forbidden message="You don't have permission to create lessons." />;
  }

  const params = await searchParams;
  const requestedWorldId = Array.isArray(params.worldId) ? params.worldId[0] : params.worldId;
  const worlds = await getWorldEditorData();
  const world = worlds.find((w) => w.id === requestedWorldId);

  if (!world) {
    return (
      <AdminGlassBackground>
        <div className="space-y-3">
          <div className={glassPanel("px-5 py-4")}>
            <PageHeader
              breadcrumbs={[
                { label: "Admin", href: "/admin" },
                { label: "Lessons", href: "/admin/lessons" },
                { label: "New" },
              ]}
              icon={BookOpen}
              title="New lesson"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Pick a world first - go to{" "}
            <Link href="/admin/lessons" className="underline">
              Lessons
            </Link>
            , select a world, then use &quot;+ New lesson&quot; there.
          </p>
        </div>
      </AdminGlassBackground>
    );
  }

  return (
    <AdminGlassBackground>
      <div className="space-y-3">
        <div className={glassPanel("px-5 py-4")}>
          <PageHeader
            breadcrumbs={[
              { label: "Admin", href: "/admin" },
              { label: "Lessons", href: `/admin/lessons?worldId=${world.id}` },
              { label: "New" },
            ]}
            icon={BookOpen}
            title="New lesson"
          />
        </div>

        <NewLessonForm worldId={world.id} worldTitle={world.title} />
      </div>
    </AdminGlassBackground>
  );
}
