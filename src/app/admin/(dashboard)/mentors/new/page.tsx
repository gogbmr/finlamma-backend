import { Users } from "lucide-react";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { AdminGlassBackground, glassPanel } from "@/components/admin/glass";
import { getStaffMember } from "@/lib/auth";
import { roleHasPermission } from "@/server/staff/repo";
import { NewMentorForm } from "../mentor-editor";

export default async function NewMentorPage() {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const canCreate = await roleHasPermission(staff.roleId, "mentor.create");
  if (!canCreate) {
    return <Forbidden message="You don't have permission to create mentors." />;
  }

  return (
    <AdminGlassBackground>
      <div className="space-y-3">
        <div className={glassPanel("px-5 py-4")}>
          <PageHeader
            breadcrumbs={[
              { label: "Admin", href: "/admin" },
              { label: "Mentors", href: "/admin/mentors" },
              { label: "New" },
            ]}
            icon={Users}
            title="New mentor"
          />
        </div>

        <NewMentorForm />
      </div>
    </AdminGlassBackground>
  );
}
