import { Globe2 } from "lucide-react";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { getStaffMember } from "@/lib/auth";
import { withTimingAndTimeout } from "@/lib/admin-diagnostics";
import { roleHasPermission } from "@/server/staff/repo";
import { getMentorEditorData } from "@/server/mentors/service";
import { getLessonEditorData } from "@/server/lessons/service";
import { getWorldEditorData } from "@/server/worlds/service";
import { WorldEditor } from "./world-editor";

// Diagnostic instrumentation (2026-10-06, see docs/STATUS.md and
// src/lib/admin-diagnostics.ts): the admin shell itself (layout.tsx) was
// instrumented first and confirmed fast (~6s total) - the hang is somewhere
// after it resolves. /admin/worlds is the one confirmed repro case, so it's
// instrumented first; every data fetch in this page gets its own timing/
// timeout so the next failure pinpoints exactly which call it's in. A thrown
// error here (unlike in layout.tsx) IS caught correctly by ./error.tsx,
// since error.js does wrap page.js in its own segment - only a same-segment
// layout.js is excluded (confirmed against this Next version's docs when
// fixing the shell's own instrumentation) - so no custom failure panel is
// needed here, a plain throw is enough.
export default async function WorldsPage() {
  const staff = await withTimingAndTimeout("worlds page: getStaffMember (auth())", getStaffMember(), 15_000);
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const [canManage, canPublish] = await withTimingAndTimeout(
    "worlds page: world.manage/world.publish permission check",
    Promise.all([
      roleHasPermission(staff.roleId, "world.manage"),
      roleHasPermission(staff.roleId, "world.publish"),
    ]),
    15_000,
  );
  if (!canManage && !canPublish) {
    return <Forbidden message="You don't have permission to manage worlds." />;
  }

  const [worlds, mentors] = await withTimingAndTimeout(
    "worlds page: getWorldEditorData + getMentorEditorData",
    Promise.all([getWorldEditorData(), getMentorEditorData()]),
    20_000,
  );

  // Doubt Zone lessons per world, for the mentor-change warning below (see
  // docs/ARCHITECTURE.md D19) - worlds/lessons are staff-created with no
  // fixed count (D25), but each world's lesson count stays small enough in
  // practice for fetching every world's list up front to remain cheap, and
  // it avoids a separate on-demand Server Action just for this.
  // Each world's fetch is timed individually (not just the Promise.all as a
  // whole) so a hang in one specific world's data - rather than all of them
  // uniformly - is visible from the logs alone, without guessing.
  console.log(`[admin-shell] "worlds page: fetching lessons for ${worlds.length} world(s)"`);
  const lessonsByWorld = await withTimingAndTimeout(
    `worlds page: getLessonEditorData x${worlds.length} (combined)`,
    Promise.all(
      worlds.map((w) =>
        withTimingAndTimeout(`worlds page: getLessonEditorData(world=${w.id})`, getLessonEditorData(w.id), 15_000),
      ),
    ),
    30_000,
  );
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
        icon={Globe2}
        title="Worlds"
        description="Worlds a learner clears in sequential order - staff decide how many exist. Publish is blocked until every en/hi/hx field is filled, and until the world's mentor is itself published. A mentor can't be unpublished while a published world still references it. A world can only be deleted once it has no lessons."
      />

      <WorldEditor
        worlds={worlds.map((w) => ({
          id: w.id,
          order: w.order,
          code: w.code,
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
