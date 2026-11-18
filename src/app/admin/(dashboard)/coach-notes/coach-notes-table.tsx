"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { MessageSquareText } from "lucide-react";
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

export type TemplateTableRow = {
  id: string;
  category: "strength" | "gap" | "opportunity" | "habit";
  template: LocalizedText;
  status: "draft" | "published";
};

// Coach note templates' master list (Task 3a).
export function CoachNotesTable({
  rows,
  total,
  page,
  pageCount,
  pageSize,
  q,
  sort,
  dir,
  status,
  selectedId,
  onSelect,
}: {
  rows: TemplateTableRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  q: string;
  sort: string | null;
  dir: "asc" | "desc";
  status: StatusFilter;
  selectedId: string | "new" | null;
  onSelect: (id: string) => void;
}) {
  const pathname = usePathname();
  const state: AdminListUrlState = { q, sort, dir, pageSize };

  const columns = useMemo<ColumnDef<TemplateTableRow, unknown>[]>(
    () => [
      {
        id: "category",
        header: () => (
          <DataTableSortHeader label="Category" field="category" pathname={pathname} state={state} />
        ),
        cell: ({ row }) => <span className="text-xs">{row.original.category}</span>,
      },
      {
        id: "template",
        header: () => (
          <DataTableSortHeader label="Template" field="template" pathname={pathname} state={state} />
        ),
        cell: ({ row }) => (
          <span className="line-clamp-1">{row.original.template.en || "(untitled)"}</span>
        ),
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
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname, q, sort, dir, pageSize],
  );

  return (
    <div className="space-y-3">
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
        <DataTableSearchForm pathname={pathname} state={state} placeholder="Search category or text…" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title={q ? "No templates match your search" : "No coach note templates yet"}
          description={
            q
              ? `Nothing matched "${q}" - try a different category or wording.`
              : "A staff member with coach_note.manage can create the first one."
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
            noun="templates"
          />
        </>
      )}
    </div>
  );
}
