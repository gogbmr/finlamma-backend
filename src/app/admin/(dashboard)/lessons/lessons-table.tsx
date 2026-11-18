"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { BookOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import {
  DataTable,
  DataTablePagination,
  DataTableSearchForm,
  DataTableSortHeader,
  type AdminListUrlState,
} from "@/components/admin/data-table";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { cn } from "@/lib/cn";
import type { LocalizedText } from "@/server/shared/schemas";

type StatusFilter = "draft" | "published" | null;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: null, label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

const KIND_LABELS: Record<string, string> = {
  video: "Video",
  story: "Story",
  quiz: "Quiz",
  boss_quiz: "Boss Quiz",
  role_play: "Role Play",
  doubt_zone: "Doubt Zone",
};

const KIND_OPTIONS: { value: string | null; label: string }[] = [
  { value: null, label: "All kinds" },
  ...Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label })),
];

// Every link here must carry ?worldId= too (the world selector lives above
// this table, see lessons/page.tsx) - built via buildAdminListHref's
// extraParams, not a bespoke local merge like the small catalogs' status
// filters use, since q/sort/dir/page ALSO need worldId preserved here.
function lessonsFilterHref(
  pathname: string,
  worldId: string,
  state: AdminListUrlState,
  kind: string | null,
  status: StatusFilter,
): string {
  const sp = new URLSearchParams();
  sp.set("worldId", worldId);
  if (state.q) sp.set("q", state.q);
  if (state.sort) sp.set("sort", state.sort);
  if (state.dir === "desc") sp.set("dir", "desc");
  if (state.pageSize !== 20) sp.set("pageSize", String(state.pageSize));
  if (kind) sp.set("kind", kind);
  if (status) sp.set("status", status);
  return `${pathname}?${sp.toString()}`;
}

export type LessonTableRow = {
  id: string;
  chapter: number;
  step: number;
  kind: string;
  title: LocalizedText;
  status: "draft" | "published";
};

// Lessons' master list for the currently-selected world (Task 3b). The
// world selector itself lives in lessons/page.tsx, above this component -
// switching worlds is a plain navigation that drops q/sort/kind/status,
// which is the right default (pagination state from one world's lesson
// list has no meaning in another).
export function LessonsTable({
  worldId,
  rows,
  total,
  page,
  pageCount,
  pageSize,
  q,
  sort,
  dir,
  kind,
  status,
  selectedId,
  onSelect,
}: {
  worldId: string;
  rows: LessonTableRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  q: string;
  sort: string | null;
  dir: "asc" | "desc";
  kind: string | null;
  status: StatusFilter;
  selectedId: string | "new" | null;
  onSelect: (id: string) => void;
}) {
  const pathname = usePathname();
  const state: AdminListUrlState = { q, sort, dir, pageSize };
  const extraParams = { worldId };

  const columns = useMemo<ColumnDef<LessonTableRow, unknown>[]>(
    () => [
      {
        id: "chapter",
        header: () => (
          <DataTableSortHeader
            label="Chapter"
            field="chapter"
            pathname={pathname}
            state={state}
            extraParams={extraParams}
          />
        ),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.chapter}</span>,
      },
      {
        id: "step",
        header: () => (
          <DataTableSortHeader
            label="Step"
            field="step"
            pathname={pathname}
            state={state}
            extraParams={extraParams}
          />
        ),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.step}</span>,
      },
      {
        id: "title",
        header: "Title",
        cell: ({ row }) => row.original.title.en || "(untitled)",
      },
      {
        id: "kind",
        header: () => (
          <DataTableSortHeader
            label="Kind"
            field="kind"
            pathname={pathname}
            state={state}
            extraParams={extraParams}
          />
        ),
        cell: ({ row }) => (
          <span className="text-xs">{KIND_LABELS[row.original.kind] ?? row.original.kind}</span>
        ),
      },
      {
        id: "status",
        header: () => (
          <DataTableSortHeader
            label="Status"
            field="status"
            pathname={pathname}
            state={state}
            extraParams={extraParams}
          />
        ),
        cell: ({ row }) => (
          <StatusBadge status={row.original.status}>{row.original.status}</StatusBadge>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname, worldId, q, sort, dir, pageSize],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex gap-3">
            {STATUS_OPTIONS.map((opt) => (
              <Link
                key={opt.label}
                href={lessonsFilterHref(pathname, worldId, state, kind, opt.value)}
                className={cn(
                  status === opt.value
                    ? "font-semibold text-foreground underline"
                    : "text-muted-foreground hover:underline",
                )}
              >
                {opt.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 border-l border-border pl-4">
            {KIND_OPTIONS.map((opt) => (
              <Link
                key={opt.label}
                href={lessonsFilterHref(pathname, worldId, state, opt.value, status)}
                className={cn(
                  kind === opt.value
                    ? "font-semibold text-foreground underline"
                    : "text-muted-foreground hover:underline",
                )}
              >
                {opt.label}
              </Link>
            ))}
          </div>
        </div>
        <DataTableSearchForm
          pathname={pathname}
          state={state}
          placeholder="Search title…"
          extraParams={extraParams}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={q ? "No lessons match your search" : "No lessons in this world yet"}
          description={
            q
              ? `Nothing matched "${q}" - try a different title.`
              : "A staff member with lesson.manage can create the first one."
          }
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={rows}
            getRowId={(r) => r.id}
            selectedRowId={selectedId === "new" ? null : selectedId}
            onRowClick={(r) => onSelect(r.id)}
          />
          <DataTablePagination
            pathname={pathname}
            state={state}
            page={page}
            pageCount={pageCount}
            total={total}
            noun="lessons"
            extraParams={extraParams}
          />
        </>
      )}
    </div>
  );
}
