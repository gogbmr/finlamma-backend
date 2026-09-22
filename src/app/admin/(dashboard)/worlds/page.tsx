import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { getStaffMember } from "@/lib/auth";
import { roleHasPermission } from "@/server/staff/repo";
import { getMentorEditorData } from "@/server/mentors/service";
import { getLessonEditorData } from "@/server/lessons/service";
import { getWorldEditorData } from "@/server/worlds/service";
import { WorldEditor } from "./world-editor";

export default async function WorldsPage() {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const [canManage, canPublish] = await Promise.all([
    roleHasPermission(staff.roleId, "world.manage"),
    roleHasPermission(staff.roleId, "world.publish"),
  ]);
  if (!canManage && !canPublish) {
    return <Forbidden message="You don't have permission to manage worlds." />;
  }

  const [worlds, mentors] = await Promise.all([getWorldEditorData(), getMentorEditorData()]);

  // Doubt Zone lessons per world, for the mentor-change warning below (see
  // docs/ARCHITECTURE.md D19) - worlds/lessons are staff-created with no
  // fixed count (D25), but each world's lesson count stays small enough in
  // practice for fetching every world's list up front to remain cheap, and
  // it avoids a separate on-demand Server Action just for this.
  const lessonsByWorld = await Promise.all(worlds.map((w) => getLessonEditorData(w.id)));
  const doubtZoneLessonsByWorldId: Record<
    string,
    { id: string; title: { en: string; hi: string; hx: string }; mentorKey: string }[]
  > = {};
  worlds.forEach((w, i) => {
    doubtZoneLessonsByWorldId[w.id] = lessonsByWorld[i]!.filter((l) => l.kind === "doubt_zone").map(
      (l) => ({
        id: l.id,
        title: l.title,
        mentorKey:
          typeof l.content === "object" && l.content !== null
            ? String((l.content as Record<string, unknown>).mentorKey ?? "")
            : "",
      }),
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin/staff" }, { label: "Worlds" }]}
        title="Worlds"
        description="Worlds a learner clears in sequential order - staff decide how many exist. Publish is blocked until every en/hi/hx field is filled, and until the world's mentor is itself published. A mentor can't be unpublished while a published world still references it. A world can only be deleted once it has no lessons."
      />

      <WorldEditor
        worlds={worlds.map((w) => ({
          id: w.id,
          order: w.order,
          title: w.title,
          tagline: w.tagline,
          theme: w.theme,
          displayXpTarget: w.displayXpTarget,
          mentorId: w.mentorId,
          status: w.status,
          artUrl: w.artUrl,
        }))}
        mentors={mentors.map((m) => ({ id: m.id, key: m.key, name: m.name, status: m.status }))}
        doubtZoneLessonsByWorldId={doubtZoneLessonsByWorldId}
        canManage={canManage}
        canPublish={canPublish}
      />
    </div>
  );
}
