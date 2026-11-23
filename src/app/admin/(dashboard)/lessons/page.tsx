import { BookOpen } from "lucide-react";
import Link from "next/link";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { getStaffMember } from "@/lib/auth";
import { DB_CONCURRENCY_LIMIT, runWithConcurrencyLimit } from "@/lib/concurrency-limit";
import { paginateRows, readPageParams } from "@/lib/admin/paginate";
import { getPermissionKeysForRole } from "@/server/staff/repo";
import { getWorldEditorData } from "@/server/worlds/service";
import { getLessonEditorData } from "@/server/lessons/service";
import { ALL_WORLDS, LessonsFilterBar } from "./lessons-filter-bar";
import { LessonsTable } from "./lessons-table";

type LessonRow = Awaited<ReturnType<typeof getLessonEditorData>>[number];

// Task 3b, extended for view/edit/delete icons + dedicated pages: the
// world/status/kind filters now live in lessons-filter-bar.tsx as dropdown
// selects (previously link-chip rows here and in lessons-table.tsx), and
// the inline create/edit form that used to sit below the table moved to
// its own pages (new/[id]/edit) - this page is table-only now. Sorting/
// searching/pagination still coexist with every filter via extraParams,
// same as before.
const LESSON_SORT_COMPARATORS: Record<string, (a: LessonRow, b: LessonRow) => number> = {
  chapter: (a, b) => a.chapter - b.chapter || a.step - b.step,
  step: (a, b) => a.step - b.step || a.chapter - b.chapter,
  kind: (a, b) => a.kind.localeCompare(b.kind),
  status: (a, b) => a.status.localeCompare(b.status),
};

function lessonSearchText(l: LessonRow): string {
  return `${l.title.en} ${l.title.hi} ${l.title.hx}`;
}

type StatusFilter = "draft" | "published" | null;

// "all" (the filter bar's explicit sentinel, never omitted from the URL -
// see lessons-filter-bar.tsx) means no filter, same as an absent param.
function parseStatusFilter(raw: string | string[] | undefined): StatusFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "draft" || value === "published" ? value : null;
}

function parseKindFilter(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value !== "all" ? value : null;
}

export default async function LessonsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const grantedKeys = await getPermissionKeysForRole(staff.roleId);
  const canCreate = grantedKeys.has("lesson.create");
  const canEdit = grantedKeys.has("lesson.edit");
  const canDelete = grantedKeys.has("lesson.delete");
  if (!grantedKeys.has("lesson.view")) {
    return <Forbidden message="You don't have permission to view lessons." />;
  }

  const worlds = await getWorldEditorData();
  if (worlds.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader
          breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Lessons" }]}
          icon={BookOpen}
          title="Lessons"
        />
        <p className="text-sm text-muted-foreground">
          No worlds exist yet - create one at{" "}
          <Link href="/admin/worlds" className="underline">
            Worlds
          </Link>{" "}
          first.
        </p>
      </div>
    );
  }

  const params = await searchParams;
  const requestedWorldId = Array.isArray(params.worldId) ? params.worldId[0] : params.worldId;
  const isAllWorlds = requestedWorldId === ALL_WORLDS;
  // Default (no worldId param at all) stays "first world", same as before
  // this change - only an explicit ?worldId=all switches to the merged
  // view, so landing on the page behaves exactly as it always has.
  const selectedWorld = isAllWorlds
    ? null
    : worlds.find((w) => w.id === requestedWorldId) ?? worlds[0]!;

  // Doubt Zone lessons across every world (CLAUDE.md rule 15,
  // docs/ARCHITECTURE.md D13/D72): runWithConcurrencyLimit, not a bare
  // Promise.all, when "All worlds" pulls getLessonEditorData for every
  // world at once. A single-world view keeps the original one-call shape.
  const lessons: LessonRow[] = isAllWorlds
    ? (await runWithConcurrencyLimit(worlds.map((w) => () => getLessonEditorData(w.id)), DB_CONCURRENCY_LIMIT)).flat()
    : await getLessonEditorData(selectedWorld!.id);

  const pageState = readPageParams(params, {
    defaultSort: "chapter",
    allowedSorts: Object.keys(LESSON_SORT_COMPARATORS),
  });
  const statusFilter = parseStatusFilter(params.status);
  const kindFilter = parseKindFilter(params.kind);

  const paged = paginateRows(lessons, {
    search: pageState.q,
    searchText: lessonSearchText,
    filter: (l) =>
      (!statusFilter || l.status === statusFilter) && (!kindFilter || l.kind === kindFilter),
    sort: pageState.sort,
    dir: pageState.dir,
    comparators: LESSON_SORT_COMPARATORS,
    page: pageState.page,
    pageSize: pageState.pageSize,
  });

  const worldTitleById = new Map(worlds.map((w) => [w.id, w.title]));
  const effectiveWorldId = isAllWorlds ? ALL_WORLDS : selectedWorld!.id;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Lessons" }]}
        icon={BookOpen}
        title="Lessons"
        description="Each world is a trail of up to 8 chapters x 5 steps. Publish is blocked until every en/hi/hx field (title, blurb, every localized field inside content) is filled, and until the lesson's world is itself published."
        action={
          // Creating a lesson needs one specific world to belong to - hidden
          // under "All worlds" rather than guessing which one you meant.
          !isAllWorlds &&
          canCreate && (
            <Button asChild size="sm">
              <Link href={`/admin/lessons/new?worldId=${selectedWorld!.id}`}>+ New lesson</Link>
            </Button>
          )
        }
      />

      <LessonsFilterBar
        worlds={worlds.map((w) => ({ id: w.id, order: w.order, title: w.title }))}
        worldId={effectiveWorldId}
        kind={kindFilter}
        status={statusFilter}
        q={pageState.q}
        sort={pageState.sort}
        dir={pageState.dir}
        pageSize={pageState.pageSize}
      />

      <LessonsTable
        worldId={effectiveWorldId}
        rows={paged.rows.map((l) => ({
          id: l.id,
          worldId: l.worldId,
          worldTitle: worldTitleById.get(l.worldId),
          chapter: l.chapter,
          step: l.step,
          kind: l.kind,
          title: l.title,
          status: l.status,
        }))}
        total={paged.total}
        page={paged.page}
        pageCount={paged.pageCount}
        pageSize={paged.pageSize}
        q={pageState.q}
        sort={pageState.sort}
        dir={pageState.dir}
        kind={kindFilter}
        status={statusFilter}
        canEdit={canEdit}
        canDelete={canDelete}
        showWorldColumn={isAllWorlds}
      />
    </div>
  );
}
