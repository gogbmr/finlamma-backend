import { Newspaper, ScrollText } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/admin/empty-state";
import { Forbidden } from "@/components/admin/forbidden";
import { KpiTileGrid } from "@/components/admin/kpi-tile";
import { PageHeader } from "@/components/admin/page-header";
import { getStaffMember } from "@/lib/auth";
import { runWithConcurrencyLimit } from "@/lib/concurrency-limit";
import { readPageParams } from "@/lib/admin/paginate";
import { getPermissionKeysForRole } from "@/server/staff/repo";
import {
  NEWS_ADMIN_SORT_COLUMNS,
  listNewsStoriesForAdmin,
  type NewsCategory,
} from "@/server/news/admin-queries";
import {
  getNewsAuditLogForAdmin,
  getNewsKpisForAdmin,
  getNewsQuizGeneratorSettings,
} from "@/server/news/service";
import {
  getPulseCheckEngagement,
  getPulseCheckScoring,
} from "@/server/pulse-check/service";
import { listActiveTopicsForPicker } from "@/server/topics/service";
import { EngagementChart } from "./engagement-chart";
import { PipelineTable } from "./pipeline-table";
import { PulseCheckScoringEditor } from "./pulse-check-scoring-editor";
import { QuizGeneratorSettingsEditor } from "./quiz-generator-settings-editor";

// Task 3b: the pipeline table below is now real-DB-paginated (news_stories
// is a growing table, unlike Task 3a's small catalogs) via
// src/server/news/admin-queries.ts, a new admin-only file. KPIs, the
// engagement chart, quiz-gen/Pulse Check settings and the audit feed below
// are all untouched - only the pipeline table itself changed.
type NewsStatusFilter = "draft" | "published" | "hidden" | null;

function parseStatusFilter(raw: string | string[] | undefined): NewsStatusFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "draft" || value === "published" || value === "hidden" ? value : null;
}

const NEWS_CATEGORY_VALUES = [
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
] as const;

function parseCategoryFilter(raw: string | string[] | undefined): NewsCategory | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (NEWS_CATEGORY_VALUES as readonly string[]).includes(value ?? "")
    ? (value as NewsCategory)
    : null;
}

function parseTopicIdFilter(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value ?? null;
}

export default async function NewsDeskPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const grantedKeys = await getPermissionKeysForRole(staff.roleId);
  const canEdit = grantedKeys.has("news.edit");
  const canDelete = grantedKeys.has("news.delete");
  const canEditSettings = grantedKeys.has("settings.edit");
  if (!grantedKeys.has("news.view")) {
    return (
      <Forbidden message="You don't have permission to use the News Desk." />
    );
  }

  const params = searchParams ? await searchParams : {};
  const pageState = readPageParams(params, {
    defaultSort: "createdAt",
    allowedSorts: NEWS_ADMIN_SORT_COLUMNS,
  });
  const statusFilter = parseStatusFilter(params.status);
  const categoryFilter = parseCategoryFilter(params.category);
  const topicIdFilter = parseTopicIdFilter(params.topicId);

  const [
    kpis,
    pipelinePage,
    topics,
    quizSettings,
    pulseCheckScoring,
    engagement,
    recentEvents,
  ] = await runWithConcurrencyLimit(
    [
      () => getNewsKpisForAdmin(),
      () =>
        listNewsStoriesForAdmin({
          page: pageState.page,
          pageSize: pageState.pageSize,
          sort: pageState.sort as (typeof NEWS_ADMIN_SORT_COLUMNS)[number],
          dir: pageState.dir,
          q: pageState.q,
          status: statusFilter,
          topicId: topicIdFilter,
          category: categoryFilter,
        }),
      () => listActiveTopicsForPicker(),
      () => getNewsQuizGeneratorSettings(),
      () => getPulseCheckScoring(),
      () => getPulseCheckEngagement(),
      () => getNewsAuditLogForAdmin(),
    ],
    // Deliberately below DB_CONCURRENCY_LIMIT (4, == src/db/client.ts's pool
    // max), not equal to it like every other call site: this is the one
    // admin page batching 7 concurrent DB calls, and the admin shell layout
    // wrapping every admin page (src/app/admin/(dashboard)/layout.tsx) needs
    // up to 2 connections of its own concurrently with this page's own data
    // fetching. At DB_CONCURRENCY_LIMIT (4) this page alone could claim the
    // whole pool, leaving the layout's own 2 with nothing free - exactly the
    // D13/D72 wedge (docs/ARCHITECTURE.md), reproduced 2026-11-19 on this
    // exact page. 2 leaves the layout's peak (2) comfortably covered within
    // a single request, at the cost of this one page loading a bit slower.
    2,
  );
  const stories = pipelinePage.rows;

  const pipelineStatusBadge =
    kpis.draftCount === 0 && kpis.undraftedCount === 0
      ? "PUBLISHED"
      : "PARTIAL";

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "News Desk" },
        ]}
        icon={Newspaper}
        title="News Desk"
        description="ingest → simplify → quiz → publish. Every AI-drafted story is a draft until a staff member with news.delete toggles it live - nothing here reaches a learner automatically."
      />

      <div className="flex items-center gap-2">
        <Badge
          variant={pipelineStatusBadge === "PUBLISHED" ? "success" : "warning"}
        >
          {pipelineStatusBadge}
        </Badge>
        <span className="text-muted-foreground text-xs">
          {kpis.undraftedCount > 0
            ? `${kpis.undraftedCount} raw item(s) not yet drafted`
            : "every ingested item has a draft"}
        </span>
      </div>

      <KpiTileGrid
        tiles={[
          {
            label: "Ingested",
            value: kpis.ingestedCount.toLocaleString("en-IN"),
          },
          {
            label: "Published",
            value: kpis.publishedCount.toLocaleString("en-IN"),
          },
          {
            label: "Draft / hidden",
            value: `${kpis.draftCount.toLocaleString("en-IN")} / ${kpis.hiddenCount.toLocaleString("en-IN")}`,
          },
          {
            label: "News source",
            value: "Mock (fixture data)",
            hint: "D50: no vendor licensed yet",
          },
        ]}
      />

      <PipelineTable
        stories={stories}
        topics={topics.map((t) => ({ id: t.id, name: t.name }))}
        canEdit={canEdit}
        canDelete={canDelete}
        total={pipelinePage.total}
        page={pipelinePage.page}
        pageCount={pipelinePage.pageCount}
        pageSize={pageState.pageSize}
        q={pageState.q}
        sort={pageState.sort ?? "createdAt"}
        dir={pageState.dir}
        status={statusFilter}
        category={categoryFilter}
        topicId={topicIdFilter}
      />

      {/* NW-38..42's quiz generator settings and D51's Pulse Check scoring/
          daily-cap are settings.edit-gated in the actions themselves
          (a separate permission from news.edit) - shown only to a viewer
          who could actually save a change, same reasoning
          /admin/settings's economy section already documents for exactly
          this "would silently fail on submit instead of being hidden" gap. */}
      <EngagementChart
        daily={engagement.daily}
        averagePct={engagement.averagePct}
      />

      {canEditSettings && (
        <QuizGeneratorSettingsEditor settings={quizSettings} />
      )}
      {canEditSettings && (
        <PulseCheckScoringEditor scoring={pulseCheckScoring} />
      )}

      <div className="border-border space-y-2 border-t pt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-foreground text-sm font-semibold">Audit log</h2>
          <span className="text-muted-foreground text-xs">
            {recentEvents.length} recent events
          </span>
        </div>
        {recentEvents.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No News Desk actions recorded yet"
            description="Story drafts, publishes and setting changes will show up here as they happen."
          />
        ) : (
          <ul className="space-y-1.5">
            {recentEvents.map((event) => (
              <li key={event.id} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground font-mono">
                  {event.createdAt.toLocaleString("en-IN", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
                <Badge variant="secondary">{event.action}</Badge>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/admin/activity-log"
          className="inline-block text-xs font-medium underline"
        >
          View full activity log
        </Link>
      </div>
    </div>
  );
}
