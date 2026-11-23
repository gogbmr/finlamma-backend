import { HelpCircle } from "lucide-react";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
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
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Questions", href: "/admin/questions" },
          { label: "New" },
        ]}
        icon={HelpCircle}
        title="New question"
        description="Created as a draft - fill in prompt/content/explanation and publish once it's ready."
      />

      <NewQuestionForm topics={topics.map((t) => ({ id: t.id, name: t.name }))} />
    </div>
  );
}
