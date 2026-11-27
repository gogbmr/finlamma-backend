import { Globe2 } from "lucide-react";
import { notFound } from "next/navigation";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { getStaffMember } from "@/lib/auth";
import { getPermissionKeysForRole } from "@/server/staff/repo";
import { getMentorEditorData } from "@/server/mentors/service";
import { getLessonEditorData } from "@/server/lessons/service";
import { getWorldEditorData } from "@/server/worlds/service";
import { AdminGlassBackground, glassPanel } from "@/components/admin/glass";
import { WorldForm } from "../../world-editor";

export default async function EditWorldPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const grantedKeys = await getPermissionKeysForRole(staff.roleId);
  const canEdit = grantedKeys.has("world.edit");
  const canDelete = grantedKeys.has("world.delete");
  if (!canEdit && !canDelete) {
    return <Forbidden message="You don't have permission to edit worlds." />;
  }

  const { id } = await params;
  const [worlds, mentors] = await Promise.all([getWorldEditorData(), getMentorEditorData()]);
  const world = worlds.find((w) => w.id === id);
  if (!world) notFound();

  // Doubt Zone lessons for THIS world only, for the mentor-change warning
  // (docs/ARCHITECTURE.md D19) - a single getLessonEditorData call, not a
  // Promise.all/runWithConcurrencyLimit loop over every world on the list
  // page like before: now that editing lives on its own per-world page,
  // there's only ever one world's lessons to fetch here.
  const lessons = await getLessonEditorData(world.id);
  const doubtZoneLessons = lessons
    .filter((l) => l.kind === "doubt_zone")
    .map((l) => ({
      id: l.id,
      title: l.title,
      mentorKey:
        typeof l.content === "object" && l.content !== null
          ? String((l.content as Record<string, unknown>).mentorKey ?? "")
          : "",
    }));

  return (
    <AdminGlassBackground>
      <div className="space-y-3">
        <div className={glassPanel("px-5 py-4")}>
          <PageHeader
            breadcrumbs={[
              { label: "Admin", href: "/admin" },
              { label: "Worlds", href: "/admin/worlds" },
              { label: world.title.en || "(untitled)", href: `/admin/worlds/${world.id}` },
              { label: "Edit" },
            ]}
            icon={Globe2}
            title={`Edit ${world.title.en || "(untitled)"}`}
          />
        </div>

        <WorldForm
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
          mentors={mentors.map((m) => ({ id: m.id, key: m.key, name: m.name, status: m.status }))}
          doubtZoneLessons={doubtZoneLessons}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </div>
    </AdminGlassBackground>
  );
}
