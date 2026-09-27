"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { MAX_HALT_REASON_LENGTH } from "@/server/trading/schemas";
import { setSymbolHaltedAction } from "./actions";

type SymbolRow = { id: string; symbol: string; sector: string; halted: boolean };

export function SymbolMasterTable({ rows }: { rows: SymbolRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [target, setTarget] = useState<SymbolRow | null>(null);
  const [reason, setReason] = useState("");

  const reasonError =
    reason.trim().length === 0
      ? "A reason is required"
      : reason.length > MAX_HALT_REASON_LENGTH
        ? `Must be at most ${MAX_HALT_REASON_LENGTH} characters`
        : null;

  function confirm() {
    if (!target || reasonError) return;
    const next = !target.halted;
    const symbol = target.symbol;
    const id = target.id;
    const givenReason = reason;
    setTarget(null);
    setReason("");
    startTransition(async () => {
      const result = await setSymbolHaltedAction(id, next, givenReason);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${symbol} is now ${next ? "HALTED" : "LIVE"}`);
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">Symbol master</h2>
        <p className="text-xs text-muted-foreground">
          Halting a symbol stops new orders in it for every learner - existing holdings are
          unaffected.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead>Sector</TableHead>
            <TableHead>State</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-mono font-medium">{row.symbol}</TableCell>
              <TableCell className="text-muted-foreground">{row.sector}</TableCell>
              <TableCell>
                <Badge variant={row.halted ? "destructive" : "secondary"}>{row.halted ? "HALT" : "LIVE"}</Badge>
              </TableCell>
              <TableCell>
                <Button
                  type="button"
                  size="sm"
                  variant={row.halted ? "outline" : "destructive"}
                  disabled={isPending}
                  onClick={() => setTarget(row)}
                >
                  {row.halted ? "Resume" : "Halt"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {target?.halted ? `Resume trading in ${target?.symbol}?` : `Halt trading in ${target?.symbol}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {target?.halted
                ? `This immediately allows new BUY/SELL orders in ${target?.symbol} again for every learner.`
                : `This stops new BUY/SELL orders in ${target?.symbol} for every learner, immediately. Existing holdings are unaffected - this only blocks placing NEW orders until you resume it.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1 px-6 pb-2">
            <Label htmlFor="symbol-halt-reason">Reason (required)</Label>
            <Textarea
              id="symbol-halt-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. unusual order flow, a data error in the price feed for this symbol"
              className={cn(reasonError && "border-destructive")}
            />
            {reasonError && <p className="text-xs text-destructive">{reasonError}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm} disabled={reasonError !== null}>
              {target?.halted ? "Resume" : "Halt"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
