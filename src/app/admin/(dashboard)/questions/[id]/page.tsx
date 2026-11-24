import { HelpCircle, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { AdminGlassBackground, glassPanel } from "@/components/admin/glass";
import { Button } from "@/components/ui/button";
import { getStaffMember } from "@/lib/auth";
import { getPermissionKeysForRole } from "@/server/staff/repo";
import { getQuestionDetailForAdmin } from "@/server/questions/admin-queries";
import { listActiveTopicsForPicker } from "@/server/topics/service";
import { QuestionView } from "../question-view";

export default async function QuestionViewPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const grantedKeys = await getPermissionKeysForRole(staff.roleId);
  if (!grantedKeys.has("question.view")) {
    return <Forbidden message="You don't have permission to view questions." />;
  }
  const canEdit = grantedKeys.has("question.edit");
  const canDelete = grantedKeys.has("question.delete");

  const { id } = await params;
  const [question, topics] = await Promise.all([
    getQuestionDetailForAdmin(id),
    listActiveTopicsForPicker(),
  ]);
  if (!question) notFound();

  const topicName = topics.find((t) => t.id === question.topicId)?.name.en ?? "No topic";

  return (
    <AdminGlassBackground>
      <div className="space-y-3">
        <div className={glassPanel("px-5 py-4")}>
          <PageHeader
            breadcrumbs={[
              { label: "Admin", href: "/admin" },
              { label: "Questions", href: "/admin/questions" },
              { label: question.prompt.en || "(untitled)" },
            ]}
            icon={HelpCircle}
            title={question.prompt.en || "(untitled)"}
            action={
              (canEdit || canDelete) && (
                <Button asChild size="sm">
                  <Link href={`/admin/questions/${question.id}/edit`}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Link>
                </Button>
              )
            }
          />
        </div>

        <QuestionView
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
          topicName={topicName}
        />
      </div>
    </AdminGlassBackground>
  );
}
