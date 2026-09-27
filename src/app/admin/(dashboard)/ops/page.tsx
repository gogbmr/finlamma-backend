import { headers } from "next/headers";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { requestMeta } from "@/lib/http";
import { requireStaff } from "@/lib/auth";
import { getOpsKpis, getRecentOpsEvents, getRiskThresholds, getUserTradingLedgerPage } from "@/server/ops/service";
import { getInstrumentEditorData, getMarketControls } from "@/server/trading/service";
import { FeedHaltControl } from "./feed-halt-control";
import { RiskThresholdsEditor } from "./risk-thresholds-editor";
import { SymbolMasterTable } from "./symbol-master-table";
import { UserLedgerTable } from "./user-ledger-table";

function formatRupees(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

export default async function OpsConsolePage() {
  let actor;
  try {
    actor = await requireStaff("trading.ops");
  } catch {
    return <Forbidden message="You don't have permission to use the Ops console." />;
  }

  const meta = requestMeta(await headers());

  const [controls, instruments, kpis, thresholds, ledgerPage, recentEvents] = await Promise.all([
    getMarketControls(),
    getInstrumentEditorData(),
    getOpsKpis(),
    getRiskThresholds(),
    getUserTradingLedgerPage(actor, {}, meta),
    getRecentOpsEvents(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin/staff" }, { label: "Ops Console" }]}
        title="Exchange Ops Console"
        description="Feed control, halts, risk monitoring and the audit trail for paper trading. Every control here is trading.ops-gated and every change is logged with who, when and why."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Active traders today</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{kpis.activeTradersToday.toLocaleString("en-IN")}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Orders today</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{kpis.ordersToday.toLocaleString("en-IN")}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">V Money in play</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{formatRupees(kpis.vmoneyInPlayPaise)}</p>
          <p className="text-xs text-muted-foreground">among learners who trade</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Risk flags</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{kpis.riskFlagsCount.toLocaleString("en-IN")}</p>
          <p className="text-xs text-muted-foreground">NEW + WATCH combined</p>
        </div>
      </div>

      <FeedHaltControl feedMode={controls.feedMode} globalHalt={controls.globalHalt} />

      <SymbolMasterTable
        rows={instruments.map((i) => ({ id: i.id, symbol: i.symbol, sector: i.sector, halted: i.halted }))}
      />

      <RiskThresholdsEditor thresholds={thresholds} />

      <UserLedgerTable initialRows={ledgerPage.data} initialNextCursor={ledgerPage.nextCursor} />

      <div className="space-y-2 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Audit log</h2>
          <span className="text-xs text-muted-foreground">{recentEvents.length} recent events</span>
        </div>
        {recentEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Ops console actions recorded yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {recentEvents.map((event) => (
              <li key={event.id} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-muted-foreground">
                  {event.createdAt.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <Badge variant="secondary">{event.action}</Badge>
                {typeof event.metadata === "object" && event.metadata && "reason" in event.metadata && (
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {String((event.metadata as Record<string, unknown>).reason ?? "")}
                  </span>
                )}
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
