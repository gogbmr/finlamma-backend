import { HelpCircle } from "lucide-react";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { getStaffMember } from "@/lib/auth";
import { roleHasPermission } from "@/server/staff/repo";
import { getQuestionEditorData } from "@/server/questions/service";
import { listActiveTopicsForPicker } from "@/server/topics/service";
import { QuestionEditor } from "./question-editor";

export default async function QuestionsPage() {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const [canManage, canPublish] = await Promise.all([
    roleHasPermission(staff.roleId, "question.manage"),
    roleHasPermission(staff.roleId, "question.publish"),
  ]);
  if (!canManage && !canPublish) {
    return <Forbidden message="You don't have permission to manage questions." />;
  }

  const [questions, topics] = await Promise.all([getQuestionEditorData(), listActiveTopicsForPicker()]);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin/staff" }, { label: "Questions" }]}
        icon={HelpCircle}
        title="Questions"
        description="Every question a lesson can reference (video pop-quiz cues, quiz/boss_quiz/role_play question lists) - single source of truth, never duplicated into lesson content. Publish is blocked until every en/hi/hx field is filled. A lesson can't be published while it references a missing or unpublished question."
      />

      <QuestionEditor
        questions={questions.map((q) => ({
          id: q.id,
          format: q.format,
          topicId: q.topicId,
          prompt: q.prompt,
          explanation: q.explanation,
          payload: q.payload,
          answer: q.answer,
          status: q.status,
        }))}
        topics={topics.map((t) => ({ id: t.id, name: t.name }))}
        canManage={canManage}
        canPublish={canPublish}
      />
    </div>
  );
}
