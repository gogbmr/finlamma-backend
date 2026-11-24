"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Globe2, Pencil, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/cn";
import type { LocalizedText } from "@/server/shared/schemas";
import { glassPanel } from "@/components/admin/glass";
import { deleteWorldAction } from "./actions";

type StatusFilter = "draft" | "published" | null;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: null, label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

// Not part of buildAdminListHref's generic AdminListUrlState - "status" is a
// Worlds-specific quick-filter, not something every future admin list will
// need the same way, so it's handled here rather than generalized into
// data-table.tsx.
function statusFilterHref(
  pathname: string,
  state: AdminListUrlState,
  status: StatusFilter,
): string {
  const sp = new URLSearchParams();
  if (state.q) sp.set("q", state.q);
  if (state.sort) sp.set("sort", state.sort);
  if (state.dir === "desc") sp.set("dir", "desc");
  if (state.pageSize !== 20) sp.set("pageSize", String(state.pageSize));
  if (status) sp.set("status", status);
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export type WorldTableRow = {
  id: string;
  order: number;
  code: string | null;
  title: LocalizedText;
  status: "draft" | "published";
  mentorId: string;
};

type MentorOption = { id: string; key: string; name: LocalizedText };

// The Worlds master list (Task 2's first rollout of the extended DataTable:
// search/sort/pagination state lives entirely in the URL, computed
// server-side by src/lib/admin/paginate.ts from src/server/worlds/service.ts's
// existing getWorldEditorData() - unchanged - never a new repo/service
// query). View/Edit navigate to their own pages; Delete opens a confirm
// dialog right here and calls the same deleteWorldAction the old inline
// form used.
export function WorldsTable({
  rows,
  mentors,
  total,
  page,
  pageCount,
  pageSize,
  q,
  sort,
  dir,
  status,
  canEdit,
  canDelete,
}: {
  rows: WorldTableRow[];
  mentors: MentorOption[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  q: string;
  sort: string | null;
  dir: "asc" | "desc";
  status: StatusFilter;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const pathname = usePathname();
  const state: AdminListUrlState = { q, sort, dir, pageSize };
  const [isPending, startTransition] = useTransition();
  const [pendingDelete, setPendingDelete] = useState<WorldTableRow | null>(null);

  const mentorName = useMemo(() => {
    const byId = new Map(mentors.map((m) => [m.id, m.name.en || m.key]));
    return (mentorId: string) => byId.get(mentorId) ?? "—";
  }, [mentors]);

  function confirmDelete() {
    if (!pendingDelete) return;
    const { id, title } = pendingDelete;
    startTransition(async () => {
      const result = await deleteWorldAction({ id });
      setPendingDelete(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`"${title.en || id}" deleted`);
    });
  }

  const columns = useMemo<ColumnDef<WorldTableRow, unknown>[]>(
    () => [
      {
        id: "order",
        header: () => (
          <DataTableSortHeader label="Order" field="order" pathname={pathname} state={state} />
        ),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.order}</span>,
      },
      {
        id: "code",
        header: () => (
          <DataTableSortHeader label="Code" field="code" pathname={pathname} state={state} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.code ?? "—"}
          </span>
        ),
      },
      {
        id: "title",
        header: () => (
          <DataTableSortHeader label="Title" field="title" pathname={pathname} state={state} />
        ),
        cell: ({ row }) => row.original.title.en || "(untitled)",
      },
      {
        id: "mentor",
        header: "Mentor",
        cell: ({ row }) => mentorName(row.original.mentorId),
      },
      {
        id: "status",
        header: () => (
          <DataTableSortHeader label="Status" field="status" pathname={pathname} state={state} />
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
              <Link href={`/admin/worlds/${row.original.id}`} aria-label={`View ${row.original.title.en || row.original.id}`}>
                <Eye className="h-4 w-4" />
              </Link>
            </Button>
            {(canEdit || canDelete) && (
              <Button variant="ghost" size="icon" title="Edit" asChild>
                <Link
                  href={`/admin/worlds/${row.original.id}/edit`}
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
    // state is rebuilt every render but only its fields drive the links -
    // listing them (rather than `state` itself) avoids recomputing columns
    // on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname, q, sort, dir, pageSize, mentorName, canEdit, canDelete],
  );

  return (
    <div className="space-y-3">
      <div className={glassPanel("space-y-4 p-5")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-4 text-sm">
            {STATUS_OPTIONS.map((opt) => (
              <Link
                key={opt.label}
                href={statusFilterHref(pathname, state, opt.value)}
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
          <DataTableSearchForm pathname={pathname} state={state} placeholder="Search title or code…" />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Globe2}
            title={q ? "No worlds match your search" : "No worlds yet"}
            description={
              q
                ? `Nothing matched "${q}" - try a different title or code.`
                : "A staff member with world.create or world.edit can create the first one."
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
              noun="worlds"
            />
          </>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this world?"
        description={
          <>
            This permanently removes &quot;{pendingDelete?.title.en || pendingDelete?.id}&quot;.
            Only possible while it has no lessons - if it does, this will fail and name them. This
            cannot be undone.
          </>
        }
        confirmLabel={isPending ? "Deleting…" : "Delete"}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
