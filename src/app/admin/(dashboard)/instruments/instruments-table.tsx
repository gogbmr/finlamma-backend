"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { TrendingUp } from "lucide-react";
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

type ActiveFilter = "active" | "inactive" | null;

const ACTIVE_OPTIONS: { value: ActiveFilter; label: string }[] = [
  { value: null, label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

function activeFilterHref(
  pathname: string,
  state: AdminListUrlState,
  active: ActiveFilter,
): string {
  const sp = new URLSearchParams();
  if (state.q) sp.set("q", state.q);
  if (state.sort) sp.set("sort", state.sort);
  if (state.dir === "desc") sp.set("dir", "desc");
  if (state.pageSize !== 20) sp.set("pageSize", String(state.pageSize));
  if (active) sp.set("active", active);
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export type InstrumentTableRow = {
  id: string;
  symbol: string;
  name: string;
  sector: string;
  active: boolean;
  halted: boolean;
};

// Instruments' master list (Task 3a). The "active" quick-filter plays the
// role Worlds/etc. use "status" for - instruments have no draft/publish
// split (edits apply immediately, per the page description above).
export function InstrumentsTable({
  rows,
  total,
  page,
  pageCount,
  pageSize,
  q,
  sort,
  dir,
  active,
  selectedId,
  onSelect,
}: {
  rows: InstrumentTableRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  q: string;
  sort: string | null;
  dir: "asc" | "desc";
  active: ActiveFilter;
  selectedId: string | "new" | null;
  onSelect: (id: string) => void;
}) {
  const pathname = usePathname();
  const state: AdminListUrlState = { q, sort, dir, pageSize };

  const columns = useMemo<ColumnDef<InstrumentTableRow, unknown>[]>(
    () => [
      {
        id: "symbol",
        header: () => (
          <DataTableSortHeader label="Symbol" field="symbol" pathname={pathname} state={state} />
        ),
        cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.symbol}</span>,
      },
      {
        id: "name",
        header: () => (
          <DataTableSortHeader label="Name" field="name" pathname={pathname} state={state} />
        ),
        cell: ({ row }) => row.original.name,
      },
      {
        id: "sector",
        header: () => (
          <DataTableSortHeader label="Sector" field="sector" pathname={pathname} state={state} />
        ),
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.sector}</span>,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <div className="flex gap-1">
            <StatusBadge status={row.original.active ? "active" : "inactive"}>
              {row.original.active ? "Active" : "Inactive"}
            </StatusBadge>
            {row.original.halted && (
              <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                HALTED
              </span>
            )}
          </div>
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
          {ACTIVE_OPTIONS.map((opt) => (
            <Link
              key={opt.label}
              href={activeFilterHref(pathname, state, opt.value)}
              className={cn(
                active === opt.value
                  ? "font-semibold text-foreground underline"
                  : "text-muted-foreground hover:underline",
              )}
            >
              {opt.label}
            </Link>
          ))}
        </div>
        <DataTableSearchForm
          pathname={pathname}
          state={state}
          placeholder="Search symbol, name, sector…"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title={q ? "No instruments match your search" : "No instruments yet"}
          description={
            q
              ? `Nothing matched "${q}" - try a different symbol, name or sector.`
              : "A staff member with instrument.manage can add the first one."
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
            noun="instruments"
          />
        </>
      )}
    </div>
  );
}
