"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { HelpCircle } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/cn";
import type { LocalizedText } from "@/server/shared/schemas";
import type { QuestionFormat } from "@/server/questions/schemas";
import type { QuestionListRow } from "./question-editor";

const ALL_FORMATS = "__all__";
const ALL_TOPICS = "__all__";

// Mirrors question-editor.tsx's own FORMAT_LABELS - kept as a separate
// local copy rather than importing it back from there, which would create
// a circular import (question-editor.tsx imports QuestionsTable from this
// file).
const FORMAT_LABELS: Record<QuestionFormat, string> = {
  single_select: "Single select",
  ordering: "Ordering",
  sort_buckets: "Sort into 2 buckets",
  fill_blank: "Fill in the blank",
  match_pairs: "Match pairs",
  spot_mistake: "Spot the mistake",
  number_guess: "Number guess (slider)",
};

const FORMAT_OPTIONS: { value: QuestionFormat | null; label: string }[] = [
  { value: null, label: "All formats" },
  ...(Object.entries(FORMAT_LABELS) as [QuestionFormat, string][]).map(([value, label]) => ({
    value,
    label,
  })),
];

type StatusFilter = "draft" | "published" | null;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: null, label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

type TopicOption = { id: string; name: LocalizedText };

// Every link carries format/status/topicId too, alongside q/sort/dir/page -
// same idea as Lessons' extraParams (worldId), just three params instead
// of one, so it's simplest as its own small local builder rather than
// threading three separate extraParams calls.
function questionsFilterHref(
  pathname: string,
  state: AdminListUrlState,
  format: QuestionFormat | null,
  status: StatusFilter,
  topicId: string | null,
): string {
  const sp = new URLSearchParams();
  if (state.q) sp.set("q", state.q);
  if (state.sort) sp.set("sort", state.sort);
  if (state.dir === "desc") sp.set("dir", "desc");
  if (state.pageSize !== 20) sp.set("pageSize", String(state.pageSize));
  if (format) sp.set("format", format);
  if (status) sp.set("status", status);
  if (topicId) sp.set("topicId", topicId);
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

// Questions' master list (Task 3b) - real-DB-paginated via
// src/server/questions/admin-queries.ts, unlike Task 3a's small catalogs.
// Rows are intentionally lightweight (id/format/topicId/promptEn/status) -
// the full record for the selected question is fetched separately, on
// demand, by question-editor.tsx's QuestionDetailLoader.
export function QuestionsTable({
  rows,
  topics,
  total,
  page,
  pageCount,
  pageSize,
  q,
  sort,
  dir,
  format,
  status,
  topicId,
  selectedId,
  onSelect,
}: {
  rows: QuestionListRow[];
  topics: TopicOption[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  q: string;
  sort: string;
  dir: "asc" | "desc";
  format: QuestionFormat | null;
  status: StatusFilter;
  topicId: string | null;
  selectedId: string | "new" | null;
  onSelect: (id: string) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const state: AdminListUrlState = { q, sort, dir, pageSize };

  const topicName = useMemo(() => {
    const byId = new Map(topics.map((t) => [t.id, t.name.en]));
    return (id: string | null) => (id ? byId.get(id) ?? "—" : "—");
  }, [topics]);

  const columns = useMemo<ColumnDef<QuestionListRow, unknown>[]>(
    () => [
      {
        id: "prompt",
        header: "Prompt",
        cell: ({ row }) => row.original.promptEn || "(untitled)",
      },
      {
        id: "format",
        header: () => (
          <DataTableSortHeader label="Format" field="format" pathname={pathname} state={state} />
        ),
        cell: ({ row }) => (
          <span className="text-xs">{FORMAT_LABELS[row.original.format]}</span>
        ),
      },
      {
        id: "topic",
        header: "Topic",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{topicName(row.original.topicId)}</span>
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
    [pathname, q, sort, dir, pageSize, topicName],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex gap-3">
            {STATUS_OPTIONS.map((opt) => (
              <Link
                key={opt.label}
                href={questionsFilterHref(pathname, state, format, opt.value, topicId)}
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
          <Select
            value={format ?? ALL_FORMATS}
            onValueChange={(value) => {
              const nextFormat = value === ALL_FORMATS ? null : (value as QuestionFormat);
              router.push(questionsFilterHref(pathname, state, nextFormat, status, topicId));
            }}
          >
            <SelectTrigger className="h-8 w-40 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMAT_OPTIONS.map((opt) => (
                <SelectItem key={opt.label} value={opt.value ?? ALL_FORMATS}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={topicId ?? ALL_TOPICS}
            onValueChange={(value) => {
              const nextTopicId = value === ALL_TOPICS ? null : value;
              router.push(questionsFilterHref(pathname, state, format, status, nextTopicId));
            }}
          >
            <SelectTrigger className="h-8 w-40 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TOPICS}>All topics</SelectItem>
              {topics.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name.en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DataTableSearchForm pathname={pathname} state={state} placeholder="Search prompt…" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={HelpCircle}
          title={q ? "No questions match your search" : "No questions yet"}
          description={
            q
              ? `Nothing matched "${q}" - try a different prompt.`
              : "A staff member with question.manage can create the first one."
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
            noun="questions"
          />
        </>
      )}
    </div>
  );
}
