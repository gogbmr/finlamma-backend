import { HelpCircle } from "lucide-react";
import Link from "next/link";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { getStaffMember } from "@/lib/auth";
import { readPageParams } from "@/lib/admin/paginate";
import { getPermissionKeysForRole } from "@/server/staff/repo";
import { QUESTION_ADMIN_SORT_COLUMNS, listQuestionsForAdmin } from "@/server/questions/admin-queries";
import { QuestionFormatSchema } from "@/server/questions/schemas";
import { listActiveTopicsForPicker } from "@/server/topics/service";
import { QuestionsTable } from "./questions-table";

// Task 3b: real DB pagination (questions is a growing table, unlike Task
// 3a's small catalogs) via src/server/questions/admin-queries.ts - a new,
// admin-only file. repo.ts/service.ts are unchanged.
type StatusFilter = "draft" | "published" | null;

function parseStatusFilter(raw: string | string[] | undefined): StatusFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "draft" || value === "published" ? value : null;
}

function parseFormatFilter(raw: string | string[] | undefined) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = QuestionFormatSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseTopicIdFilter(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value ?? null;
}

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const grantedKeys = await getPermissionKeysForRole(staff.roleId);
  const canCreate = grantedKeys.has("question.create");
  const canEdit = grantedKeys.has("question.edit");
  const canDelete = grantedKeys.has("question.delete");
  if (!grantedKeys.has("question.view")) {
    return <Forbidden message="You don't have permission to view questions." />;
  }

  const topics = await listActiveTopicsForPicker();

  const params = searchParams ? await searchParams : {};
  const pageState = readPageParams(params, {
    defaultSort: "createdAt",
    allowedSorts: QUESTION_ADMIN_SORT_COLUMNS,
  });
  const statusFilter = parseStatusFilter(params.status);
  const formatFilter = parseFormatFilter(params.format);
  const topicIdFilter = parseTopicIdFilter(params.topicId);

  const paged = await listQuestionsForAdmin({
    page: pageState.page,
    pageSize: pageState.pageSize,
    sort: pageState.sort as (typeof QUESTION_ADMIN_SORT_COLUMNS)[number],
    dir: pageState.dir,
    q: pageState.q,
    format: formatFilter,
    status: statusFilter,
    topicId: topicIdFilter,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Questions" }]}
        icon={HelpCircle}
        title="Questions"
        description="Every question a lesson can reference (video pop-quiz cues, quiz/boss_quiz/role_play question lists) - single source of truth, never duplicated into lesson content. Publish is blocked until every en/hi/hx field is filled. A lesson can't be published while it references a missing or unpublished question."
        action={
          canCreate && (
            <Button asChild size="sm">
              <Link href="/admin/questions/new">+ New question</Link>
            </Button>
          )
        }
      />

      <QuestionsTable
        rows={paged.rows}
        topics={topics.map((t) => ({ id: t.id, name: t.name }))}
        total={paged.total}
        page={paged.page}
        pageCount={paged.pageCount}
        pageSize={pageState.pageSize}
        q={pageState.q}
        sort={pageState.sort ?? "createdAt"}
        dir={pageState.dir}
        format={formatFilter}
        status={statusFilter}
        topicId={topicIdFilter}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </div>
  );
}
