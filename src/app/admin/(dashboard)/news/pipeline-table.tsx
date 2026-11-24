"use client";

import { useTransition } from "react";
import { Eye, Newspaper } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DataTablePagination,
  DataTableSearchForm,
  DataTableSortHeader,
  type AdminListUrlState,
} from "@/components/admin/data-table";
import { EmptyState } from "@/components/admin/empty-state";
import { glassPanel } from "@/components/admin/glass";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import type { LocalizedText } from "@/server/shared/schemas";
import type { NewsCategory } from "@/server/news/admin-queries";
import {
  updateNewsStoryQualityOverrideAction,
  updateNewsStoryStatusAction,
  updateNewsStoryTopicAction,
} from "./actions";

export type PipelineStoryRow = {
  id: string;
  headline: LocalizedText;
  outlet: string;
  category: string;
  qualityGrade: "A" | "B" | "C";
  qualityGradeOverride: "A" | "B" | "C" | null;
  topicId: string | null;
  status: "draft" | "published" | "hidden";
  adviceLikeWarnings: string[] | null;
  createdAt: Date;
};

type NewsStatusFilter = "draft" | "published" | "hidden" | null;

const STATUS_OPTIONS: { value: NewsStatusFilter; label: string }[] = [
  { value: null, label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "hidden", label: "Hidden" },
];

// Mirrors newsCategoryEnum's declared values (src/db/schema/news.ts) - kept
// as a local literal list rather than importing the schema module itself
// into this client component (only the TYPE is imported above, which is
// erased at compile time).
const NEWS_CATEGORIES: NewsCategory[] = [
  "rbi_rates",
  "inflation",
  "stock_market_basics",
  "ipos_new_listings",
  "mutual_funds",
  "banking",
  "scams_fraud",
  "government_budget",
  "global_markets",
  "currency",
];

const ALL_CATEGORIES = "__all__";
const ALL_TOPICS = "__all__";

// Every link carries status/category/topicId too, alongside q/sort/dir/page -
// same idea as Lessons' extraParams (worldId) and Questions' own local
// builder, just three params instead of one.
function pipelineFilterHref(
  pathname: string,
  state: AdminListUrlState,
  status: NewsStatusFilter,
  category: NewsCategory | null,
  topicId: string | null,
): string {
  const sp = new URLSearchParams();
  if (state.q) sp.set("q", state.q);
  if (state.sort) sp.set("sort", state.sort);
  if (state.dir === "desc") sp.set("dir", "desc");
  if (state.pageSize !== 20) sp.set("pageSize", String(state.pageSize));
  if (status) sp.set("status", status);
  if (category) sp.set("category", category);
  if (topicId) sp.set("topicId", topicId);
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

const STATUS_LABEL: Record<PipelineStoryRow["status"], string> = {
  draft: "Draft",
  published: "Published",
  hidden: "Hidden",
};

const NO_TOPIC = "__none__";
const NO_OVERRIDE = "__auto__";

function StatusSelect({
  storyId,
  status,
  canDelete,
}: {
  storyId: string;
  status: PipelineStoryRow["status"];
  canDelete: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function change(next: string) {
    startTransition(async () => {
      const result = await updateNewsStoryStatusAction(storyId, next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Story ${STATUS_LABEL[next as PipelineStoryRow["status"]].toLowerCase()}`);
    });
  }

  return (
    <Select value={status} onValueChange={change} disabled={isPending || !canDelete}>
      <SelectTrigger className="w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(STATUS_LABEL) as PipelineStoryRow["status"][]).map((s) => (
          <SelectItem key={s} value={s}>
            {STATUS_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function QualityOverrideSelect({
  storyId,
  qualityGrade,
  qualityGradeOverride,
  canEdit,
}: {
  storyId: string;
  qualityGrade: "A" | "B" | "C";
  qualityGradeOverride: "A" | "B" | "C" | null;
  canEdit: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function change(next: string) {
    startTransition(async () => {
      const result = await updateNewsStoryQualityOverrideAction(storyId, next === NO_OVERRIDE ? null : next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Quality grade updated");
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <Badge variant="secondary">{qualityGrade}</Badge>
      <Select value={qualityGradeOverride ?? NO_OVERRIDE} onValueChange={change} disabled={isPending || !canEdit}>
        <SelectTrigger className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_OVERRIDE}>Auto</SelectItem>
          <SelectItem value="A">A</SelectItem>
          <SelectItem value="B">B</SelectItem>
          <SelectItem value="C">C</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function TopicSelect({
  storyId,
  topicId,
  topics,
  canEdit,
}: {
  storyId: string;
  topicId: string | null;
  topics: { id: string; name: LocalizedText }[];
  canEdit: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function change(next: string) {
    startTransition(async () => {
      const result = await updateNewsStoryTopicAction(storyId, next === NO_TOPIC ? null : next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Topic updated");
    });
  }

  return (
    <Select value={topicId ?? NO_TOPIC} onValueChange={change} disabled={isPending || !canEdit}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_TOPIC}>No topic</SelectItem>
        {topics.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name.en}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PipelineTable({
  stories,
  topics,
  canEdit,
  canDelete,
  total,
  page,
  pageCount,
  pageSize,
  q,
  sort,
  dir,
  status,
  category,
  topicId,
}: {
  stories: PipelineStoryRow[];
  topics: { id: string; name: LocalizedText }[];
  canEdit: boolean;
  canDelete: boolean;
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  q: string;
  sort: string;
  dir: "asc" | "desc";
  status: NewsStatusFilter;
  category: NewsCategory | null;
  topicId: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const state: AdminListUrlState = { q, sort, dir, pageSize };

  return (
    <div className={glassPanel("space-y-2 p-4")}>
      <h2 className="text-sm font-semibold text-foreground">Today&apos;s pipeline</h2>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex gap-3">
            {STATUS_OPTIONS.map((opt) => (
              <Link
                key={opt.label}
                href={pipelineFilterHref(pathname, state, opt.value, category, topicId)}
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
            value={category ?? ALL_CATEGORIES}
            onValueChange={(value) => {
              const next = value === ALL_CATEGORIES ? null : (value as NewsCategory);
              router.push(pipelineFilterHref(pathname, state, status, next, topicId));
            }}
          >
            <SelectTrigger className="h-8 w-44 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
              {NEWS_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={topicId ?? ALL_TOPICS}
            onValueChange={(value) => {
              const next = value === ALL_TOPICS ? null : value;
              router.push(pipelineFilterHref(pathname, state, status, category, next));
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
        <DataTableSearchForm pathname={pathname} state={state} placeholder="Search headline…" />
      </div>

      {stories.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title={q ? "No stories match your search" : "No stories ingested yet"}
          description={
            q
              ? `Nothing matched "${q}" - try a different headline.`
              : "The ingestion and drafting jobs run on a schedule (or trigger them manually via the Inngest dev server)."
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Headline</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>
                  <DataTableSortHeader label="Category" field="category" pathname={pathname} state={state} />
                </TableHead>
                <TableHead>
                  <DataTableSortHeader label="Grade" field="qualityGrade" pathname={pathname} state={state} />
                </TableHead>
                <TableHead>Topic</TableHead>
                <TableHead>
                  <DataTableSortHeader label="Status" field="status" pathname={pathname} state={state} />
                </TableHead>
                <TableHead className="sr-only">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stories.map((story) => (
                <TableRow key={story.id}>
                  <TableCell className="max-w-72">
                    <span className="text-sm font-medium text-foreground">
                      {story.headline.en || "(untitled)"}
                    </span>
                    {story.adviceLikeWarnings && story.adviceLikeWarnings.length > 0 && (
                      <p className="mt-1 text-xs text-destructive">
                        Advice-like phrasing: {story.adviceLikeWarnings.join(", ")}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{story.outlet}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{story.category}</TableCell>
                  <TableCell>
                    <QualityOverrideSelect
                      storyId={story.id}
                      qualityGrade={story.qualityGrade}
                      qualityGradeOverride={story.qualityGradeOverride}
                      canEdit={canEdit}
                    />
                  </TableCell>
                  <TableCell>
                    <TopicSelect storyId={story.id} topicId={story.topicId} topics={topics} canEdit={canEdit} />
                  </TableCell>
                  <TableCell>
                    <StatusSelect storyId={story.id} status={story.status} canDelete={canDelete} />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" title="View" asChild>
                      <Link
                        href={`/admin/news/${story.id}`}
                        aria-label={`View ${story.headline.en || story.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DataTablePagination
            pathname={pathname}
            state={state}
            page={page}
            pageCount={pageCount}
            total={total}
            noun="stories"
          />
        </>
      )}
    </div>
  );
}
