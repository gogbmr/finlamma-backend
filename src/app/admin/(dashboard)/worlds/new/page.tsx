import { Globe2 } from "lucide-react";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { getStaffMember } from "@/lib/auth";
import { roleHasPermission } from "@/server/staff/repo";
import { getMentorEditorData } from "@/server/mentors/service";
import { NewWorldForm } from "../world-editor";

export default async function NewWorldPage() {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const canManage = await roleHasPermission(staff.roleId, "world.manage");
  if (!canManage) {
    return <Forbidden message="You don't have permission to create worlds." />;
  }

  const mentors = await getMentorEditorData();

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Worlds", href: "/admin/worlds" },
          { label: "New" },
        ]}
        icon={Globe2}
        title="New world"
        description="Created as a draft - fill in title/tagline/mentor and publish once it's ready."
      />

      <NewWorldForm
        mentors={mentors.map((m) => ({ id: m.id, key: m.key, name: m.name, status: m.status }))}
      />
    </div>
  );
}
