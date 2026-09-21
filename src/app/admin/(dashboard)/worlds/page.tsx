import { Forbidden } from "@/components/admin/forbidden";
import { getStaffMember } from "@/lib/auth";
import { roleHasPermission } from "@/server/staff/repo";
import { getMentorEditorData } from "@/server/mentors/service";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Worlds</h1>
        <p className="text-sm text-neutral-600">
          The 7 worlds a learner clears in order. Publish is blocked until every en/hi/hx field is
          filled, and until the world&apos;s mentor is itself published. A mentor can&apos;t be
          unpublished while a published world still references it.
        </p>
      </div>

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
        canManage={canManage}
        canPublish={canPublish}
      />
    </div>
  );
}
