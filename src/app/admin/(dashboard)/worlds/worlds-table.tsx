"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Globe2 } from "lucide-react";
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
// query). Selecting a row doesn't navigate; it just tells WorldEditor which
// world's form to show below.
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
  selectedId,
  onSelect,
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
  selectedId: string | "new" | null;
  onSelect: (id: string) => void;
}) {
  const pathname = usePathname();
  const state: AdminListUrlState = { q, sort, dir, pageSize };

  const mentorName = useMemo(() => {
    const byId = new Map(mentors.map((m) => [m.id, m.name.en || m.key]));
    return (mentorId: string) => byId.get(mentorId) ?? "—";
  }, [mentors]);

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
    ],
    // state is rebuilt every render but only its fields drive the links -
    // listing them (rather than `state` itself) avoids recomputing columns
    // on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname, q, sort, dir, pageSize, mentorName],
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
        <DataTableSearchForm pathname={pathname} state={state} placeholder="Search title or code…" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Globe2}
          title={q ? "No worlds match your search" : "No worlds yet"}
          description={
            q
              ? `Nothing matched "${q}" - try a different title or code.`
              : "A staff member with world.manage can create the first one."
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
            noun="worlds"
          />
        </>
      )}
    </div>
  );
}
