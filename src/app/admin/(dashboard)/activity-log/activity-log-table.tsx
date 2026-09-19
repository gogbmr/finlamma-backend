"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { DataTable } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";

export type ActivityLogRow = {
  id: string;
  createdAt: string;
  actorType: "user" | "staff" | "system";
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
};

export function ActivityLogTable({ rows }: { rows: ActivityLogRow[] }) {
  const columns = useMemo<ColumnDef<ActivityLogRow, unknown>[]>(
    () => [
      {
        header: "When",
        accessorKey: "createdAt",
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap text-neutral-500">
            {new Date(row.original.createdAt).toLocaleString()}
          </span>
        ),
      },
      {
        header: "Actor",
        accessorKey: "actorType",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Badge variant="muted">{row.original.actorType}</Badge>
            {row.original.actorId && (
              <span className="font-mono text-xs text-neutral-500">{row.original.actorId}</span>
            )}
          </div>
        ),
      },
      {
        header: "Action",
        accessorKey: "action",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.action}</span>,
      },
      {
        header: "Target",
        accessorKey: "targetType",
        cell: ({ row }) =>
          row.original.targetType ? (
            <span className="text-xs text-neutral-500">
              {row.original.targetType}:{row.original.targetId}
            </span>
          ) : (
            <span className="text-xs text-neutral-400">-</span>
          ),
      },
    ],
    [],
  );

  return <DataTable columns={columns} data={rows} emptyMessage="No activity yet." />;
}
