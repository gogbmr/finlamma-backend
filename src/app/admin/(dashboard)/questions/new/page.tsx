import { HelpCircle } from "lucide-react";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { AdminGlassBackground, glassPanel } from "@/components/admin/glass";
import { getStaffMember } from "@/lib/auth";
import { roleHasPermission } from "@/server/staff/repo";
import { listActiveTopicsForPicker } from "@/server/topics/service";
import { NewQuestionForm } from "../question-editor";

export default async function NewQuestionPage() {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const canCreate = await roleHasPermission(staff.roleId, "question.create");
  if (!canCreate) {
    return <Forbidden message="You don't have permission to create questions." />;
  }

  const topics = await listActiveTopicsForPicker();

  return (
    <AdminGlassBackground>
      <div className="space-y-3">
        <div className={glassPanel("px-5 py-4")}>
          <PageHeader
            breadcrumbs={[
              { label: "Admin", href: "/admin" },
              { label: "Questions", href: "/admin/questions" },
              { label: "New" },
            ]}
            icon={HelpCircle}
            title="New question"
          />
        </div>

        <NewQuestionForm topics={topics.map((t) => ({ id: t.id, name: t.name }))} />
      </div>
    </AdminGlassBackground>
  );
}
