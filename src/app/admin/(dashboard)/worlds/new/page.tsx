import { Globe2 } from "lucide-react";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { getStaffMember } from "@/lib/auth";
import { roleHasPermission } from "@/server/staff/repo";
import { getMentorEditorData } from "@/server/mentors/service";
import { AdminGlassBackground, glassPanel } from "@/components/admin/glass";
import { NewWorldForm } from "../world-editor";

export default async function NewWorldPage() {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const canCreate = await roleHasPermission(staff.roleId, "world.create");
  if (!canCreate) {
    return <Forbidden message="You don't have permission to create worlds." />;
  }

  const mentors = await getMentorEditorData();

  return (
    <AdminGlassBackground>
      <div className="space-y-3">
        <div className={glassPanel("px-5 py-4")}>
          <PageHeader
            breadcrumbs={[
              { label: "Admin", href: "/admin" },
              { label: "Worlds", href: "/admin/worlds" },
              { label: "New" },
            ]}
            icon={Globe2}
            title="New world"
          />
        </div>

        <NewWorldForm
          mentors={mentors.map((m) => ({ id: m.id, key: m.key, name: m.name, status: m.status }))}
        />
      </div>
    </AdminGlassBackground>
  );
}
