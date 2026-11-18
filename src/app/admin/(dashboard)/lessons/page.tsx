import { BookOpen } from "lucide-react";
import Link from "next/link";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { cn } from "@/lib/cn";
import { getStaffMember } from "@/lib/auth";
import { paginateRows, readPageParams } from "@/lib/admin/paginate";
import { roleHasPermission } from "@/server/staff/repo";
import { getMentorEditorData } from "@/server/mentors/service";
import { getWorldEditorData } from "@/server/worlds/service";
import { getLessonEditorData } from "@/server/lessons/service";
import { LessonEditor } from "./lesson-editor";

type LessonRow = Awaited<ReturnType<typeof getLessonEditorData>>[number];

// Task 3b: same in-memory recipe as Task 3a's small catalogs - see
// src/lib/admin/paginate.ts. getLessonEditorData(worldId) itself is
// unchanged; it's still called once per selected world, exactly as before,
// and this only slices that one world's result. Lessons keeps its world
// selector (the Link chips below) alongside the new search/sort/filter/
// pagination - the two coexist via extraParams (worldId) on every
// generated link, so paging/sorting/searching never silently drops you
// onto a different world.
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

function parseStatusFilter(raw: string | string[] | undefined): StatusFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "draft" || value === "published" ? value : null;
}

function parseKindFilter(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value ?? null;
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

  const [canManage, canPublish] = await Promise.all([
    roleHasPermission(staff.roleId, "lesson.manage"),
    roleHasPermission(staff.roleId, "lesson.publish"),
  ]);
  if (!canManage && !canPublish) {
    return <Forbidden message="You don't have permission to manage lessons." />;
  }

  const worlds = await getWorldEditorData();
  const params = await searchParams;
  const requestedWorldId = Array.isArray(params.worldId) ? params.worldId[0] : params.worldId;
  const selectedWorld = worlds.find((w) => w.id === requestedWorldId) ?? worlds[0];

  if (!selectedWorld) {
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

  const [lessons, mentors] = await Promise.all([
    getLessonEditorData(selectedWorld.id),
    getMentorEditorData(),
  ]);
  // The world's *current* mentor - compared in the editor against each
  // doubt_zone lesson's own content.mentorKey (fixed at authoring time) to
  // warn staff when they've drifted apart. See docs/ARCHITECTURE.md D19.
  const worldMentorKey = mentors.find((m) => m.id === selectedWorld.mentorId)?.key ?? null;

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

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Lessons" }]}
        icon={BookOpen}
        title="Lessons"
        description="Each world is a trail of up to 8 chapters x 5 steps. Publish is blocked until every en/hi/hx field (title, blurb, every localized field inside content) is filled, and until the lesson's world is itself published."
      />

      <div className="flex flex-wrap gap-2">
        {worlds.map((w) => (
          <Link
            key={w.id}
            href={`/admin/lessons?worldId=${w.id}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              w.id === selectedWorld.id
                ? "bg-primary text-primary-foreground"
                : "border border-border hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {w.order}. {w.title.en || "(untitled)"}
          </Link>
        ))}
      </div>

      <LessonEditor
        worldId={selectedWorld.id}
        worldTitle={selectedWorld.title}
        worldMentorKey={worldMentorKey}
        lessons={paged.rows}
        canManage={canManage}
        canPublish={canPublish}
        total={paged.total}
        page={paged.page}
        pageCount={paged.pageCount}
        pageSize={paged.pageSize}
        q={pageState.q}
        sort={pageState.sort}
        dir={pageState.dir}
        kind={kindFilter}
        status={statusFilter}
      />
    </div>
  );
}
