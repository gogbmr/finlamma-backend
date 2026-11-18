import { MessageSquareText } from "lucide-react";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { getStaffMember } from "@/lib/auth";
import { paginateRows, readPageParams } from "@/lib/admin/paginate";
import { roleHasPermission } from "@/server/staff/repo";
import { getCoachNoteTemplateEditorData } from "@/server/report-card/service";
import { CoachNoteEditor } from "./coach-note-editor";

type TemplateRow = Awaited<ReturnType<typeof getCoachNoteTemplateEditorData>>[number];

// Task 3a: same pattern as the other small catalogs - see
// src/lib/admin/paginate.ts. getCoachNoteTemplateEditorData() itself is
// unchanged.
const TEMPLATE_SORT_COMPARATORS: Record<string, (a: TemplateRow, b: TemplateRow) => number> = {
  category: (a, b) => a.category.localeCompare(b.category),
  template: (a, b) => a.template.en.localeCompare(b.template.en),
  status: (a, b) => a.status.localeCompare(b.status),
};

function templateSearchText(t: TemplateRow): string {
  return `${t.category} ${t.template.en} ${t.template.hi} ${t.template.hx}`;
}

type StatusFilter = "draft" | "published" | null;

function parseStatusFilter(raw: string | string[] | undefined): StatusFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "draft" || value === "published" ? value : null;
}

export default async function CoachNotesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const [canManage, canPublish] = await Promise.all([
    roleHasPermission(staff.roleId, "coach_note.manage"),
    roleHasPermission(staff.roleId, "coach_note.publish"),
  ]);
  if (!canManage && !canPublish) {
    return (
      <Forbidden message="You don't have permission to manage coach note templates. Only super_admin does." />
    );
  }

  const templates = await getCoachNoteTemplateEditorData();

  const params = searchParams ? await searchParams : {};
  const pageState = readPageParams(params, {
    defaultSort: "category",
    allowedSorts: Object.keys(TEMPLATE_SORT_COMPARATORS),
  });
  const statusFilter = parseStatusFilter(params.status);

  const paged = paginateRows(templates, {
    search: pageState.q,
    searchText: templateSearchText,
    filter: statusFilter ? (t) => t.status === statusFilter : undefined,
    sort: pageState.sort,
    dir: pageState.dir,
    comparators: TEMPLATE_SORT_COMPARATORS,
    page: pageState.page,
    pageSize: pageState.pageSize,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Coach Notes" }]}
        icon={MessageSquareText}
        title="Coach note templates"
        description="One published template per category is picked at random to fill in a learner's weekly report card, with their own numbers substituted for the {{placeholders}}."
      />

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Tone rule (docs/ARCHITECTURE.md D34)</p>
        <p className="mt-1">
          Every template must be encouraging and age-appropriate. Never shaming, never
          pressuring, and never comparative - a coach note must never read as a rank or a
          comparison against other learners, only this learner&apos;s own progress. This applies
          to en, hi and hx wording alike.
        </p>
      </div>

      <CoachNoteEditor
        templates={paged.rows}
        canManage={canManage}
        canPublish={canPublish}
        total={paged.total}
        page={paged.page}
        pageCount={paged.pageCount}
        pageSize={paged.pageSize}
        q={pageState.q}
        sort={pageState.sort}
        dir={pageState.dir}
        status={statusFilter}
      />
    </div>
  );
}
