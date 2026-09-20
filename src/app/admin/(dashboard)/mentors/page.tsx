import { Forbidden } from "@/components/admin/forbidden";
import { getStaffMember } from "@/lib/auth";
import { roleHasPermission } from "@/server/staff/repo";
import { getMentorEditorData } from "@/server/mentors/service";
import { MentorEditor } from "./mentor-editor";

export default async function MentorsPage() {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const [canManage, canPublish] = await Promise.all([
    roleHasPermission(staff.roleId, "mentor.manage"),
    roleHasPermission(staff.roleId, "mentor.publish"),
  ]);
  if (!canManage && !canPublish) {
    return <Forbidden message="You don't have permission to manage mentors." />;
  }

  const mentors = await getMentorEditorData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Mentors</h1>
        <p className="text-sm text-neutral-600">
          The mentor evolution stages (Baby/Father/Grandpa Lamma) shown as the learner clears
          worlds. Publish is blocked until every en/hi/hx field is filled.
        </p>
      </div>

      <MentorEditor
        mentors={mentors.map((m) => ({
          id: m.id,
          key: m.key,
          order: m.order,
          name: m.name,
          bio: m.bio,
          worldRangeStart: m.worldRangeStart,
          worldRangeEnd: m.worldRangeEnd,
          status: m.status,
          artUrl: m.artUrl,
        }))}
        canManage={canManage}
        canPublish={canPublish}
      />
    </div>
  );
}
