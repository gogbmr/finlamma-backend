"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Award } from "lucide-react";
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
import { glassPanel } from "@/components/admin/glass";
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

export type BadgeTableRow = {
  id: string;
  name: LocalizedText;
  category: string;
  vmReward: number;
  status: "draft" | "published";
};

// Badges' master list (Task 3a). Display-only here - the V Money amount
// column is read-only in this table; editing it still happens only in
// BadgeForm, unchanged.
export function BadgesTable({
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
  rows: BadgeTableRow[];
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

  const columns = useMemo<ColumnDef<BadgeTableRow, unknown>[]>(
    () => [
      {
        id: "name",
        header: () => (
          <DataTableSortHeader label="Name" field="name" pathname={pathname} state={state} />
        ),
        cell: ({ row }) => row.original.name.en || "(untitled)",
      },
      {
        id: "category",
        header: () => (
          <DataTableSortHeader label="Category" field="category" pathname={pathname} state={state} />
        ),
        cell: ({ row }) => <span className="text-xs">{row.original.category}</span>,
      },
      {
        id: "vmReward",
        header: () => (
          <DataTableSortHeader label="VM reward" field="vmReward" pathname={pathname} state={state} />
        ),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.vmReward}</span>,
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
        <DataTableSearchForm pathname={pathname} state={state} placeholder="Search name or category…" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Award}
          title={q ? "No badges match your search" : "No badges yet"}
          description={
            q
              ? `Nothing matched "${q}" - try a different name or category.`
              : "A staff member with economy.manage can create the first one."
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
            noun="badges"
          />
        </>
      )}
    </div>
  );
}
