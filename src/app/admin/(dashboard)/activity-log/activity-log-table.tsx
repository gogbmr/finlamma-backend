"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ScrollText } from "lucide-react";
import { useMemo } from "react";
import { EmptyState } from "@/components/admin/empty-state";
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
          <span className="text-xs whitespace-nowrap text-muted-foreground">
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
              <span className="font-mono text-xs text-muted-foreground">{row.original.actorId}</span>
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
            <span className="text-xs text-muted-foreground">
              {row.original.targetType}:{row.original.targetId}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/60">-</span>
          ),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyState={<EmptyState icon={ScrollText} title="No activity yet" description="Staff and user actions will appear here as they happen." />}
    />
  );
}
