"use client";

import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/cn";

// Thin shadcn-style wrapper over TanStack Table's headless row/column model.
// Pagination and filtering happen server-side - either cursor + URL search
// params for a growing table (see src/lib/activity-log.ts) or offset +
// URL search params for a small, already-fully-loaded catalog (see
// src/lib/admin/paginate.ts) - this only owns rendering, not data fetching.
// onRowClick/getRowId/selectedRowId are optional: a read-only table
// (activity log, staff) simply omits them.
export function DataTable<TData>({
  columns,
  data,
  emptyMessage = "No results.",
  emptyState,
  onRowClick,
  getRowId,
  selectedRowId,
}: {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  emptyMessage?: string;
  // A richer <EmptyState> to render instead of the plain emptyMessage text,
  // when the caller wants an icon/action (e.g. "Invite your first staff
  // member"). Falls back to emptyMessage when omitted.
  emptyState?: ReactNode;
  onRowClick?: (row: TData) => void;
  getRowId?: (row: TData) => string;
  selectedRowId?: string | null;
}) {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="p-0">
              {emptyState ?? (
                <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
              )}
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => {
            const rowId = getRowId?.(row.original);
            const selected = rowId !== undefined && rowId === selectedRowId;
            return (
              <TableRow
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                aria-selected={onRowClick ? selected : undefined}
                className={cn(onRowClick && "cursor-pointer", selected && "bg-accent")}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

// --- Server-side search/sort/pagination chrome, state kept entirely in URL
// search params (never component state that could drift from the URL) ---
// Generic across any admin list page built on either src/lib/activity-log.ts
// (cursor) or src/lib/admin/paginate.ts (offset) - a page passes its current
// q/sort/dir/pageSize once, and every control below derives its href from
// that same shared merge logic, so Task 3's other entity tables reuse this
// instead of re-deriving it per entity.
export type AdminListUrlState = {
  q: string;
  sort: string | null;
  dir: "asc" | "desc";
  pageSize: number;
};

// Builds a same-page href carrying every current list param except the ones
// being overridden. Changing q/sort/dir/pageSize always resets to page 1
// (a changed filter restarting pagination is the only sane default); an
// explicit { page } override is how Prev/Next move without resetting.
export function buildAdminListHref(
  pathname: string,
  state: AdminListUrlState,
  overrides: Partial<AdminListUrlState> & { page?: number },
): string {
  const merged = {
    q: overrides.q ?? state.q,
    sort: overrides.sort ?? state.sort,
    dir: overrides.dir ?? state.dir,
    pageSize: overrides.pageSize ?? state.pageSize,
    page: overrides.page ?? 1,
  };
  const sp = new URLSearchParams();
  if (merged.q) sp.set("q", merged.q);
  if (merged.sort) sp.set("sort", merged.sort);
  if (merged.dir === "desc") sp.set("dir", "desc");
  if (merged.page > 1) sp.set("page", String(merged.page));
  if (merged.pageSize !== 20) sp.set("pageSize", String(merged.pageSize));
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

// Sortable column header - a plain Link (no client JS needed to sort),
// toggling direction when it's already the active column. Pass as a
// column's `header` render function.
export function DataTableSortHeader({
  label,
  field,
  pathname,
  state,
}: {
  label: string;
  field: string;
  pathname: string;
  state: AdminListUrlState;
}) {
  const active = state.sort === field;
  const nextDir: "asc" | "desc" = active && state.dir === "asc" ? "desc" : "asc";
  return (
    <Link
      href={buildAdminListHref(pathname, state, { sort: field, dir: nextDir })}
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      {label}
      {active && <span aria-hidden>{state.dir === "asc" ? "▲" : "▼"}</span>}
    </Link>
  );
}

// Free-text search box. The only control here that needs client JS - the
// typed value is arbitrary, so it can't be a static Link like sort/paging -
// submits via router.push through the same href-merge logic everything else
// uses, rather than a native form GET (which would still work, but as a
// full page reload instead of a client-side transition).
export function DataTableSearchForm({
  pathname,
  state,
  placeholder = "Search…",
}: {
  pathname: string;
  state: AdminListUrlState;
  placeholder?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(state.q);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    router.push(buildAdminListHref(pathname, state, { q: value }));
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-56 pl-8"
        />
      </div>
      <Button type="submit" variant="outline" size="sm">
        Search
      </Button>
      {state.q && (
        <Link
          href={buildAdminListHref(pathname, state, { q: "" })}
          className="text-xs text-muted-foreground underline"
        >
          Clear
        </Link>
      )}
    </form>
  );
}

// Prev/Next pager with a plain-English count. Every control is a Link (no
// client JS needed) - disabled visually, not removed from the DOM, at the
// first/last page. Renders nothing when there's nothing to page through.
export function DataTablePagination({
  pathname,
  state,
  page,
  pageCount,
  total,
  noun = "results",
}: {
  pathname: string;
  state: AdminListUrlState;
  page: number;
  pageCount: number;
  total: number;
  noun?: string;
}) {
  if (total === 0) return null;

  const pagerButton =
    "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm";

  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <p>
        Page {page} of {pageCount} · {total.toLocaleString("en-IN")} {noun}
      </p>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link
            href={buildAdminListHref(pathname, state, { page: page - 1 })}
            className={cn(pagerButton, "hover:bg-accent")}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Prev
          </Link>
        ) : (
          <span className={cn(pagerButton, "opacity-40")}>
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Prev
          </span>
        )}
        {page < pageCount ? (
          <Link
            href={buildAdminListHref(pathname, state, { page: page + 1 })}
            className={cn(pagerButton, "hover:bg-accent")}
          >
            Next <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : (
          <span className={cn(pagerButton, "opacity-40")}>
            Next <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
      </div>
    </div>
  );
}
