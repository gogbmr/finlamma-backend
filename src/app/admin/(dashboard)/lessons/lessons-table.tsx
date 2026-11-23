"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { BookOpen, Eye, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  DataTable,
  DataTablePagination,
  DataTableSearchForm,
  DataTableSortHeader,
  type AdminListUrlState,
} from "@/components/admin/data-table";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import type { LocalizedText } from "@/server/shared/schemas";
import { deleteLessonAction } from "./actions";

export const KIND_LABELS: Record<string, string> = {
  video: "Video",
  story: "Story",
  quiz: "Quiz",
  boss_quiz: "Boss Quiz",
  role_play: "Role Play",
  doubt_zone: "Doubt Zone",
};

export type LessonTableRow = {
  id: string;
  worldId: string;
  worldTitle?: LocalizedText;
  chapter: number;
  step: number;
  kind: string;
  title: LocalizedText;
  status: "draft" | "published";
};

// Lessons' master list for the currently-selected world filter (view/edit
// icons navigate to their own pages, Delete opens a confirm dialog right
// here - same Actions-column pattern as worlds/worlds-table.tsx). The
// world/status/kind filter controls themselves now live in
// lessons-filter-bar.tsx, above this table; this component only needs
// worldId/kind/status to carry them through every sort/search/pager link
// unchanged. showWorldColumn renders an extra "World" column (only
// meaningful when the "All worlds" filter is active and rows span more
// than one world).
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
  canEdit,
  canDelete,
  showWorldColumn,
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
  status: "draft" | "published" | null;
  canEdit: boolean;
  canDelete: boolean;
  showWorldColumn: boolean;
}) {
  const pathname = usePathname();
  const state: AdminListUrlState = { q, sort, dir, pageSize };
  // Same "always explicit" URL scheme as lessons-filter-bar.tsx - kind/
  // status are "all" rather than omitted when unset, so every link (sort,
  // search, pager, filter dropdown) produces the same querystring shape.
  const extraParams = useMemo(
    () => ({ worldId, kind: kind ?? "all", status: status ?? "all" }),
    [worldId, kind, status],
  );

  const [isPending, startTransition] = useTransition();
  const [pendingDelete, setPendingDelete] = useState<LessonTableRow | null>(null);

  function confirmDelete() {
    if (!pendingDelete) return;
    const { id, title } = pendingDelete;
    startTransition(async () => {
      const result = await deleteLessonAction({ id });
      setPendingDelete(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`"${title.en || id}" deleted`);
    });
  }

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
      ...(showWorldColumn
        ? [
            {
              id: "world",
              header: "World",
              cell: ({ row }: { row: { original: LessonTableRow } }) => (
                <span className="text-xs text-muted-foreground">
                  {row.original.worldTitle?.en || "—"}
                </span>
              ),
            } satisfies ColumnDef<LessonTableRow, unknown>,
          ]
        : []),
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
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon" title="View" asChild>
              <Link
                href={`/admin/lessons/${row.original.id}`}
                aria-label={`View ${row.original.title.en || row.original.id}`}
              >
                <Eye className="h-4 w-4" />
              </Link>
            </Button>
            {(canEdit || canDelete) && (
              <Button variant="ghost" size="icon" title="Edit" asChild>
                <Link
                  href={`/admin/lessons/${row.original.id}/edit`}
                  aria-label={`Edit ${row.original.title.en || row.original.id}`}
                >
                  <Pencil className="h-4 w-4" />
                </Link>
              </Button>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="icon"
                title="Delete"
                aria-label={`Delete ${row.original.title.en || row.original.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingDelete(row.original);
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname, worldId, q, sort, dir, pageSize, kind, status, showWorldColumn, canEdit, canDelete],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-3">
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
              : "A staff member with lesson.create can create the first one."
          }
        />
      ) : (
        <>
          <DataTable columns={columns} data={rows} getRowId={(r) => r.id} />
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

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this lesson?"
        description={
          <>
            This permanently removes &quot;{pendingDelete?.title.en || pendingDelete?.id}&quot;.
            Only possible while it&apos;s a draft - a published lesson must be unpublished first.
            This cannot be undone.
          </>
        }
        confirmLabel={isPending ? "Deleting…" : "Delete"}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
