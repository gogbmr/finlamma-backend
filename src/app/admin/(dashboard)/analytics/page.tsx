import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { getStaffMember } from "@/lib/auth";
import { roleHasPermission } from "@/server/staff/repo";
import { getAdminAnalyticsSummary } from "@/server/analytics/service";

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

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
        title="Analytics"
        description="Aggregate business patterns only - never an individual learner's activity. Computed directly from our own database (cached briefly), refreshed every few minutes. For behavioural/funnel analysis, see the PostHog dashboard directly."
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Users</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Tile label="Total active accounts" value={fmt(summary.users.totalActive)} />
          <Tile label="New today" value={fmt(summary.users.newToday)} />
          <Tile label="New, last 7 days" value={fmt(summary.users.newLast7Days)} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Retention</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Tile label="DAU" value={fmt(summary.retention.dau)} hint="Active today" />
          <Tile label="WAU" value={fmt(summary.retention.wau)} hint="Active in the last 7 days" />
          <Tile label="MAU" value={fmt(summary.retention.mau)} hint="Active in the last 30 days" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Lessons</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Tile label="Completed today" value={fmt(summary.lessons.completedToday)} />
          <Tile label="Completed, last 7 days" value={fmt(summary.lessons.completedLast7Days)} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Trading</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Tile label="Active traders today" value={fmt(summary.trading.activeTradersToday)} />
          <Tile label="Orders today" value={fmt(summary.trading.ordersToday)} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">News &amp; Pulse Check</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Tile
            label="7-day engagement"
            value={`${summary.news.pulseCheckEngagementPct7Day}%`}
            hint="Avg. % of active learners who did Pulse Check each day - see the News Desk for the daily breakdown"
          />
          <Tile label="Active learner base" value={fmt(summary.news.pulseCheckActiveUsers)} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Revenue</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Tile label="Active ad-free entitlements" value={fmt(summary.revenue.activeAdFreeEntitlements)} />
          <Tile label="New purchases, last 7 days" value={fmt(summary.revenue.newPurchasesLast7Days)} />
        </div>
      </section>
    </div>
  );
}
