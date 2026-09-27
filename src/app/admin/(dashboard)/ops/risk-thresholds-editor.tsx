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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateRiskThresholdsAction } from "./actions";

type RiskThresholds = { newAccountDays: number; concentrationPct: number; dailyOrderCount: number };

function fieldError(value: number, max: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return "Must be greater than 0";
  if (value > max) return `Must be at most ${max}`;
  return null;
}

export function RiskThresholdsEditor({ thresholds }: { thresholds: RiskThresholds }) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState(thresholds);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const errors = {
    newAccountDays: fieldError(form.newAccountDays, 90),
    concentrationPct: fieldError(form.concentrationPct, 100),
    dailyOrderCount: fieldError(form.dailyOrderCount, 1000),
  };
  const hasError = Object.values(errors).some((e) => e !== null);

  function confirmSave() {
    setConfirmOpen(false);
    startTransition(async () => {
      const result = await updateRiskThresholdsAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Risk-flag thresholds saved");
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">Risk-flag thresholds</h2>
        <p className="text-xs text-muted-foreground">
          A flag is a prompt to take a look, never an accusation - most flagged accounts are just
          new learners or a single confident trade, not wrongdoing.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>NEW: account younger than (days)</Label>
          <Input
            type="number"
            value={form.newAccountDays}
            onChange={(e) => setForm({ ...form, newAccountDays: Number(e.target.value) })}
          />
          {errors.newAccountDays && <p className="text-xs text-destructive">{errors.newAccountDays}</p>}
        </div>
        <div className="space-y-1">
          <Label>WATCH: one position over (% of account)</Label>
          <Input
            type="number"
            value={form.concentrationPct}
            onChange={(e) => setForm({ ...form, concentrationPct: Number(e.target.value) })}
          />
          {errors.concentrationPct && <p className="text-xs text-destructive">{errors.concentrationPct}</p>}
        </div>
        <div className="space-y-1">
          <Label>WATCH: orders in a day over</Label>
          <Input
            type="number"
            value={form.dailyOrderCount}
            onChange={(e) => setForm({ ...form, dailyOrderCount: Number(e.target.value) })}
          />
          {errors.dailyOrderCount && <p className="text-xs text-destructive">{errors.dailyOrderCount}</p>}
        </div>
      </div>

      <Button type="button" size="sm" onClick={() => setConfirmOpen(true)} disabled={isPending || hasError}>
        Save
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change risk-flag thresholds?</AlertDialogTitle>
            <AlertDialogDescription>
              This changes how every learner is flagged in the User Trading Ledger, immediately -
              it does not notify anyone or change what they can do.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSave}>Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
