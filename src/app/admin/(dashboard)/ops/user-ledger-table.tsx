"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadLedgerPageAction } from "./actions";

type LedgerRow = {
  userId: string;
  displayName: string;
  joinedAt: string;
  balancePaise: number;
  totalPnlPaise: number;
  concentrationPct: number;
  ordersToday: number;
  flag: "new" | "watch" | "ok";
};

function formatRupees(paise: number): string {
  const rupees = paise / 100;
  const sign = rupees < 0 ? "−" : "";
  return `${sign}₹${Math.abs(rupees).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const FLAG_VARIANT = { new: "info", watch: "warning", ok: "muted" } as const;
const FLAG_LABEL = { new: "NEW", watch: "WATCH", ok: "OK" } as const;

export function UserLedgerTable({
  initialRows,
  initialNextCursor,
}: {
  initialRows: LedgerRow[];
  initialNextCursor: string | null;
}) {
  const [rows, setRows] = useState(initialRows);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [isPending, startTransition] = useTransition();

  function loadMore() {
    startTransition(async () => {
      const page = await loadLedgerPageAction(nextCursor);
      setRows((prev) => [...prev, ...page.data]);
      setNextCursor(page.nextCursor);
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">User trading ledger</h2>
        <p className="text-xs text-muted-foreground">
          Only learners who have ever placed an order appear here. A flag is a prompt to take a
          look, not an accusation - a brand-new account or one confident trade will often show
          NEW or WATCH on its own. Every time this table is loaded, that view is logged with your
          staff account.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No learner has placed an order yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Learner</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">V Money</TableHead>
              <TableHead className="text-right">P&amp;L</TableHead>
              <TableHead className="text-right">Top position</TableHead>
              <TableHead className="text-right">Orders today</TableHead>
              <TableHead className="text-center">Flag</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.userId}>
                <TableCell className="font-medium">{row.displayName}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(row.joinedAt).toLocaleDateString("en-IN")}
                </TableCell>
                <TableCell className="text-right font-mono">{formatRupees(row.balancePaise)}</TableCell>
                <TableCell
                  className={`text-right font-mono ${row.totalPnlPaise < 0 ? "text-destructive" : "text-emerald-600"}`}
                >
                  {formatRupees(row.totalPnlPaise)}
                </TableCell>
                <TableCell className="text-right font-mono">{row.concentrationPct.toFixed(0)}%</TableCell>
                <TableCell className="text-right font-mono">{row.ordersToday}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={FLAG_VARIANT[row.flag]}>{FLAG_LABEL[row.flag]}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {nextCursor && (
        <Button type="button" variant="outline" size="sm" onClick={loadMore} disabled={isPending}>
          {isPending ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
