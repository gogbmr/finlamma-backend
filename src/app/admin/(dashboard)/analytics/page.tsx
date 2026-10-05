import { Activity, BarChart3, BookOpen, LineChart, Newspaper, Users, Wallet } from "lucide-react";
import { Forbidden } from "@/components/admin/forbidden";
import { KpiTileGrid } from "@/components/admin/kpi-tile";
import { PageHeader } from "@/components/admin/page-header";
import { getStaffMember } from "@/lib/auth";
import { roleHasPermission } from "@/server/staff/repo";
import { getAdminAnalyticsSummary } from "@/server/analytics/service";

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

export default async function AnalyticsDashboardPage() {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const canView = await roleHasPermission(staff.roleId, "analytics.view");
  if (!canView) {
    return <Forbidden message="You don't have permission to view analytics." />;
  }

  const summary = await getAdminAnalyticsSummary();

  return (
    <div className="space-y-8">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin/staff" }, { label: "Analytics" }]}
        icon={BarChart3}
        title="Analytics"
        description="Aggregate business patterns only - never an individual learner's activity. Computed directly from our own database (cached briefly), refreshed every few minutes. For behavioural/funnel analysis, see the PostHog dashboard directly."
      />

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden /> Users
        </h2>
        <KpiTileGrid
          tiles={[
            { label: "Total active accounts", value: fmt(summary.users.totalActive) },
            { label: "New today", value: fmt(summary.users.newToday) },
            { label: "New, last 7 days", value: fmt(summary.users.newLast7Days) },
          ]}
        />
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Activity className="h-4 w-4 text-muted-foreground" aria-hidden /> Retention
        </h2>
        <KpiTileGrid
          tiles={[
            { label: "DAU", value: fmt(summary.retention.dau), hint: "Active today" },
            { label: "WAU", value: fmt(summary.retention.wau), hint: "Active in the last 7 days" },
            { label: "MAU", value: fmt(summary.retention.mau), hint: "Active in the last 30 days" },
          ]}
        />
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <BookOpen className="h-4 w-4 text-muted-foreground" aria-hidden /> Lessons
        </h2>
        <KpiTileGrid
          tiles={[
            { label: "Completed today", value: fmt(summary.lessons.completedToday) },
            { label: "Completed, last 7 days", value: fmt(summary.lessons.completedLast7Days) },
          ]}
        />
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <LineChart className="h-4 w-4 text-muted-foreground" aria-hidden /> Trading
        </h2>
        <KpiTileGrid
          tiles={[
            { label: "Active traders today", value: fmt(summary.trading.activeTradersToday) },
            { label: "Orders today", value: fmt(summary.trading.ordersToday) },
          ]}
        />
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Newspaper className="h-4 w-4 text-muted-foreground" aria-hidden /> News &amp; Pulse Check
        </h2>
        <KpiTileGrid
          tiles={[
            {
              label: "7-day engagement",
              value: `${summary.news.pulseCheckEngagementPct7Day}%`,
              hint: "Avg. % of active learners who did Pulse Check each day - see the News Desk for the daily breakdown",
            },
            { label: "Active learner base", value: fmt(summary.news.pulseCheckActiveUsers) },
          ]}
        />
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden /> Revenue
        </h2>
        <KpiTileGrid
          tiles={[
            { label: "Active ad-free entitlements", value: fmt(summary.revenue.activeAdFreeEntitlements) },
            { label: "New purchases, last 7 days", value: fmt(summary.revenue.newPurchasesLast7Days) },
          ]}
        />
      </section>
    </div>
  );
}
