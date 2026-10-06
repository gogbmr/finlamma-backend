import {
  AlertTriangle,
  ReceiptText,
  ScrollText,
  Siren,
  Users,
  Wallet,
} from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/admin/empty-state";
import { Forbidden } from "@/components/admin/forbidden";
import { KpiTileGrid } from "@/components/admin/kpi-tile";
import { PageHeader } from "@/components/admin/page-header";
import { requestMeta } from "@/lib/http";
import { requireStaff } from "@/lib/auth";
import {
  DB_CONCURRENCY_LIMIT,
  runWithConcurrencyLimit,
} from "@/lib/concurrency-limit";
import {
  getOpsKpis,
  getRecentOpsEvents,
  getRiskThresholds,
  getUserTradingLedgerPage,
} from "@/server/ops/service";
import {
  getInstrumentEditorData,
  getMarketControls,
} from "@/server/trading/service";
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
    return (
      <Forbidden message="You don't have permission to use the Ops console." />
    );
  }

  const meta = requestMeta(await headers());

  const [controls, instruments, kpis, thresholds, ledgerPage, recentEvents] =
    await runWithConcurrencyLimit(
      [
        () => getMarketControls(),
        () => getInstrumentEditorData(),
        () => getOpsKpis(),
        () => getRiskThresholds(),
        () => getUserTradingLedgerPage(actor, {}, meta),
        () => getRecentOpsEvents(),
      ],
      DB_CONCURRENCY_LIMIT,
    );

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Admin", href: "/admin/staff" },
          { label: "Ops Console" },
        ]}
        icon={Siren}
        title="Exchange Ops Console"
        description="Feed control, halts, risk monitoring and the audit trail for paper trading. Every control here is trading.ops-gated and every change is logged with who, when and why."
      />

      <KpiTileGrid
        tiles={[
          {
            icon: Users,
            label: "Active traders today",
            value: kpis.activeTradersToday.toLocaleString("en-IN"),
          },
          {
            icon: ReceiptText,
            label: "Orders today",
            value: kpis.ordersToday.toLocaleString("en-IN"),
          },
          {
            icon: Wallet,
            label: "V Money in play",
            value: formatRupees(kpis.vmoneyInPlayPaise),
            hint: "among learners who trade",
          },
          {
            icon: AlertTriangle,
            label: "Risk flags",
            value: kpis.riskFlagsCount.toLocaleString("en-IN"),
            hint: "NEW + WATCH combined",
          },
        ]}
      />

      <div className="border-border space-y-6 border-t pt-6">
        <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
          Market controls
        </p>
        <FeedHaltControl
          feedMode={controls.feedMode}
          globalHalt={controls.globalHalt}
        />
        <SymbolMasterTable
          rows={instruments.map((i) => ({
            id: i.id,
            symbol: i.symbol,
            sector: i.sector,
            halted: i.halted,
          }))}
        />
      </div>

      <div className="border-border space-y-6 border-t pt-6">
        <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
          Risk &amp; learners
        </p>
        <RiskThresholdsEditor thresholds={thresholds} />
        <UserLedgerTable
          initialRows={ledgerPage.data}
          initialNextCursor={ledgerPage.nextCursor}
        />
      </div>

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
            title="No Ops console actions recorded yet"
            description="Feed halts, risk threshold changes and instrument edits will show up here as they happen."
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
                {typeof event.metadata === "object" &&
                  event.metadata &&
                  "reason" in event.metadata && (
                    <span className="text-muted-foreground min-w-0 flex-1 truncate">
                      {String(
                        (event.metadata as Record<string, unknown>).reason ??
                          "",
                      )}
                    </span>
                  )}
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
