"use client";

import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Thin shadcn-style wrapper over TanStack Table's headless row/column model.
// Pagination and filtering happen server-side (the page fetches one page at
// a time via cursor + URL search params, see src/lib/activity-log.ts) - this
// only owns rendering, not data fetching.
export function DataTable<TData>({
  columns,
  data,
  emptyMessage = "No results.",
  emptyState,
}: {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  emptyMessage?: string;
  // A richer <EmptyState> to render instead of the plain emptyMessage text,
  // when the caller wants an icon/action (e.g. "Invite your first staff
  // member"). Falls back to emptyMessage when omitted.
  emptyState?: ReactNode;
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
          table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
