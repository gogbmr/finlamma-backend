import Link from "next/link";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { cn } from "@/lib/cn";
import { getStaffMember } from "@/lib/auth";
import { roleHasPermission } from "@/server/staff/repo";
import { getMentorEditorData } from "@/server/mentors/service";
import { getWorldEditorData } from "@/server/worlds/service";
import { getLessonEditorData } from "@/server/lessons/service";
import { LessonEditor } from "./lesson-editor";

export default async function LessonsPage({
  searchParams,
}: {
  searchParams: Promise<{ worldId?: string }>;
}) {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const [canManage, canPublish] = await Promise.all([
    roleHasPermission(staff.roleId, "lesson.manage"),
    roleHasPermission(staff.roleId, "lesson.publish"),
  ]);
  if (!canManage && !canPublish) {
    return <Forbidden message="You don't have permission to manage lessons." />;
  }

  const worlds = await getWorldEditorData();
  const { worldId: requestedWorldId } = await searchParams;
  const selectedWorld = worlds.find((w) => w.id === requestedWorldId) ?? worlds[0];

  if (!selectedWorld) {
    return (
      <div className="space-y-4">
        <PageHeader
          breadcrumbs={[{ label: "Admin", href: "/admin/staff" }, { label: "Lessons" }]}
          title="Lessons"
        />
        <p className="text-sm text-muted-foreground">
          No worlds exist yet - create one at{" "}
          <Link href="/admin/worlds" className="underline">
            Worlds
          </Link>{" "}
          first.
        </p>
      </div>
    );
  }

  const [lessons, mentors] = await Promise.all([
    getLessonEditorData(selectedWorld.id),
    getMentorEditorData(),
  ]);
  // The world's *current* mentor - compared in the editor against each
  // doubt_zone lesson's own content.mentorKey (fixed at authoring time) to
  // warn staff when they've drifted apart. See docs/ARCHITECTURE.md D19.
  const worldMentorKey = mentors.find((m) => m.id === selectedWorld.mentorId)?.key ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin/staff" }, { label: "Lessons" }]}
        title="Lessons"
        description="Each world is a trail of up to 8 chapters x 5 steps. Publish is blocked until every en/hi/hx field (title, blurb, every localized field inside content) is filled, and until the lesson's world is itself published."
      />

      <div className="flex flex-wrap gap-2">
        {worlds.map((w) => (
          <Link
            key={w.id}
            href={`/admin/lessons?worldId=${w.id}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              w.id === selectedWorld.id
                ? "bg-primary text-primary-foreground"
                : "border border-border hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {w.order}. {w.title.en || "(untitled)"}
          </Link>
        ))}
      </div>

      <LessonEditor
        worldId={selectedWorld.id}
        worldMentorKey={worldMentorKey}
        lessons={lessons.map((l) => ({
          id: l.id,
          chapter: l.chapter,
          step: l.step,
          kind: l.kind,
          title: l.title,
          blurb: l.blurb,
          content: l.content,
          status: l.status,
          inProgressLearnerCount: l.inProgressLearnerCount,
        }))}
        canManage={canManage}
        canPublish={canPublish}
      />
    </div>
  );
}
