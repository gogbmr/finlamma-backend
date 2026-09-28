import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { getStaffMember } from "@/lib/auth";
import { roleHasPermission } from "@/server/staff/repo";
import { getNewsAuditLogForAdmin, getNewsKpisForAdmin, getNewsPipelineForAdmin, getNewsQuizGeneratorSettings } from "@/server/news/service";
import { getPulseCheckEngagement, getPulseCheckScoring } from "@/server/pulse-check/service";
import { listActiveTopicsForPicker } from "@/server/topics/service";
import { EngagementChart } from "./engagement-chart";
import { PipelineTable } from "./pipeline-table";
import { PulseCheckScoringEditor } from "./pulse-check-scoring-editor";
import { QuizGeneratorSettingsEditor } from "./quiz-generator-settings-editor";

export default async function NewsDeskPage() {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const [canManage, canPublish, canManageSettings] = await Promise.all([
    roleHasPermission(staff.roleId, "news.manage"),
    roleHasPermission(staff.roleId, "news.publish"),
    roleHasPermission(staff.roleId, "settings.manage"),
  ]);
  if (!canManage && !canPublish) {
    return <Forbidden message="You don't have permission to use the News Desk." />;
  }

  const [kpis, stories, topics, quizSettings, pulseCheckScoring, engagement, recentEvents] = await Promise.all([
    getNewsKpisForAdmin(),
    getNewsPipelineForAdmin(),
    listActiveTopicsForPicker(),
    getNewsQuizGeneratorSettings(),
    getPulseCheckScoring(),
    getPulseCheckEngagement(),
    getNewsAuditLogForAdmin(),
  ]);

  const pipelineStatusBadge =
    kpis.draftCount === 0 && kpis.undraftedCount === 0 ? "PUBLISHED" : "PARTIAL";

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin/staff" }, { label: "News Desk" }]}
        title="News Desk"
        description="ingest → simplify → quiz → publish. Every AI-drafted story is a draft until a staff member with news.publish toggles it live - nothing here reaches a learner automatically."
      />

      <div className="flex items-center gap-2">
        <Badge variant={pipelineStatusBadge === "PUBLISHED" ? "success" : "warning"}>
          {pipelineStatusBadge}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {kpis.undraftedCount > 0
            ? `${kpis.undraftedCount} raw item(s) not yet drafted`
            : "every ingested item has a draft"}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Ingested</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{kpis.ingestedCount.toLocaleString("en-IN")}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Published</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{kpis.publishedCount.toLocaleString("en-IN")}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Draft / hidden</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">
            {kpis.draftCount.toLocaleString("en-IN")} / {kpis.hiddenCount.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">News source</p>
          <p className="mt-1 text-sm font-semibold text-foreground">Mock (fixture data)</p>
          <p className="text-xs text-muted-foreground">D50: no vendor licensed yet</p>
        </div>
      </div>

      <PipelineTable
        stories={stories.map((s) => ({
          id: s.id,
          headline: (s.content as { headline: { en: string; hi: string; hx: string } }).headline,
          outlet: s.outlet,
          category: s.category,
          qualityGrade: s.qualityGrade,
          qualityGradeOverride: s.qualityGradeOverride,
          topicId: s.topicId,
          status: s.status,
          adviceLikeWarnings: s.adviceLikeWarnings,
          createdAt: s.createdAt,
        }))}
        topics={topics.map((t) => ({ id: t.id, name: t.name }))}
      />

      {/* NW-38..42's quiz generator settings and D51's Pulse Check scoring/
          daily-cap are settings.manage-gated in the actions themselves
          (a narrower trust bar than news.manage) - shown only to a viewer
          who could actually save a change, same reasoning
          /admin/settings's economy section already documents for exactly
          this "would silently fail on submit instead of being hidden" gap. */}
      <EngagementChart daily={engagement.daily} averagePct={engagement.averagePct} />

      {canManageSettings && <QuizGeneratorSettingsEditor settings={quizSettings} />}
      {canManageSettings && <PulseCheckScoringEditor scoring={pulseCheckScoring} />}

      <div className="space-y-2 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Audit log</h2>
          <span className="text-xs text-muted-foreground">{recentEvents.length} recent events</span>
        </div>
        {recentEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No News Desk actions recorded yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {recentEvents.map((event) => (
              <li key={event.id} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-muted-foreground">
                  {event.createdAt.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <Badge variant="secondary">{event.action}</Badge>
              </li>
            ))}
          </ul>
        )}
        <Link href="/admin/activity-log" className="inline-block text-xs font-medium underline">
          View full activity log
        </Link>
      </div>
    </div>
  );
}
