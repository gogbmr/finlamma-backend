"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Pencil, Trash2, Users } from "lucide-react";
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
import { glassPanel } from "@/components/admin/glass";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { LocalizedText } from "@/server/shared/schemas";
import { deleteMentorAction } from "./actions";

type StatusFilter = "draft" | "published" | null;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: null, label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

// Same shape as worlds-table.tsx's statusFilterHref - "status" is an
// entity-specific quick-filter, not generalized into data-table.tsx.
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

export type MentorTableRow = {
  id: string;
  key: string;
  order: number;
  name: LocalizedText;
  status: "draft" | "published";
};

// Mentors' master list (Task 3a: Worlds' DataTable pattern rolled out to
// the small catalogs). View/Edit navigate to their own pages; Delete opens
// a confirm dialog right here and calls the same deleteMentorAction the
// old inline form used.
export function MentorsTable({
  rows,
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
  rows: MentorTableRow[];
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
  const [pendingDelete, setPendingDelete] = useState<MentorTableRow | null>(null);

  function confirmDelete() {
    if (!pendingDelete) return;
    const { id, name } = pendingDelete;
    startTransition(async () => {
      const result = await deleteMentorAction({ id });
      setPendingDelete(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`"${name.en || id}" deleted`);
    });
  }

  const columns = useMemo<ColumnDef<MentorTableRow, unknown>[]>(
    () => [
      {
        id: "order",
        header: () => (
          <DataTableSortHeader label="Order" field="order" pathname={pathname} state={state} />
        ),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.order}</span>,
      },
      {
        id: "key",
        header: () => (
          <DataTableSortHeader label="Key" field="key" pathname={pathname} state={state} />
        ),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.key}</span>,
      },
      {
        id: "name",
        header: () => (
          <DataTableSortHeader label="Name" field="name" pathname={pathname} state={state} />
        ),
        cell: ({ row }) => row.original.name.en || "(untitled)",
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
              <Link
                href={`/admin/mentors/${row.original.id}`}
                aria-label={`View ${row.original.name.en || row.original.id}`}
              >
                <Eye className="h-4 w-4" />
              </Link>
            </Button>
            {(canEdit || canDelete) && (
              <Button variant="ghost" size="icon" title="Edit" asChild>
                <Link
                  href={`/admin/mentors/${row.original.id}/edit`}
                  aria-label={`Edit ${row.original.name.en || row.original.id}`}
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
                aria-label={`Delete ${row.original.name.en || row.original.id}`}
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
    [pathname, q, sort, dir, pageSize, canEdit, canDelete],
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
          <DataTableSearchForm pathname={pathname} state={state} placeholder="Search key or name…" />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={q ? "No mentors match your search" : "No mentors yet"}
            description={
              q
                ? `Nothing matched "${q}" - try a different key or name.`
                : "A staff member with mentor.create can create the first one."
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
              noun="mentors"
            />
          </>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this mentor?"
        description={
          <>
            This permanently removes &quot;{pendingDelete?.name.en || pendingDelete?.id}&quot;.
            Only possible while it&apos;s a draft with no world assigned to it - a published
            mentor must be unpublished first. This cannot be undone.
          </>
        }
        confirmLabel={isPending ? "Deleting…" : "Delete"}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
