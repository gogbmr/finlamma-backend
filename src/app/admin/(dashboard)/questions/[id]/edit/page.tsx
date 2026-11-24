import { HelpCircle } from "lucide-react";
import { notFound } from "next/navigation";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { AdminGlassBackground, glassPanel } from "@/components/admin/glass";
import { getStaffMember } from "@/lib/auth";
import { getPermissionKeysForRole } from "@/server/staff/repo";
import { getQuestionDetailForAdmin } from "@/server/questions/admin-queries";
import { listActiveTopicsForPicker } from "@/server/topics/service";
import { QuestionForm } from "../../question-editor";

export default async function EditQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const grantedKeys = await getPermissionKeysForRole(staff.roleId);
  const canEdit = grantedKeys.has("question.edit");
  const canDelete = grantedKeys.has("question.delete");
  if (!canEdit && !canDelete) {
    return <Forbidden message="You don't have permission to edit questions." />;
  }

  const { id } = await params;
  const [question, topics] = await Promise.all([
    getQuestionDetailForAdmin(id),
    listActiveTopicsForPicker(),
  ]);
  if (!question) notFound();

  return (
    <AdminGlassBackground>
      <div className="space-y-3">
        <div className={glassPanel("px-5 py-4")}>
          <PageHeader
            breadcrumbs={[
              { label: "Admin", href: "/admin" },
              { label: "Questions", href: "/admin/questions" },
              { label: question.prompt.en || "(untitled)", href: `/admin/questions/${question.id}` },
              { label: "Edit" },
            ]}
            icon={HelpCircle}
            title={`Edit ${question.prompt.en || "(untitled)"}`}
          />
        </div>

        <QuestionForm
          question={{
            id: question.id,
            format: question.format,
            topicId: question.topicId,
            prompt: question.prompt,
            explanation: question.explanation,
            payload: question.payload,
            answer: question.answer,
            status: question.status,
          }}
          topics={topics.map((t) => ({ id: t.id, name: t.name }))}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </div>
    </AdminGlassBackground>
  );
}
