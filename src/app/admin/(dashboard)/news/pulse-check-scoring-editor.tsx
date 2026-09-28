"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePulseCheckScoringAction } from "./actions";

export type PulseCheckScoring = {
  speedBonusThresholdPct: number;
  speedBonusVm: number;
  comboBonusPerStep: number;
  comboBonusCap: number;
  allCorrectBonusVm: number;
  dailyVmCap: number;
};

function scoringError(s: PulseCheckScoring): string | null {
  if (!Number.isInteger(s.speedBonusThresholdPct) || s.speedBonusThresholdPct < 1 || s.speedBonusThresholdPct > 100) {
    return "Speed bonus threshold must be 1-100%";
  }
  if (!Number.isInteger(s.speedBonusVm) || s.speedBonusVm < 0 || s.speedBonusVm > 200) {
    return "Speed bonus VM must be 0-200";
  }
  if (!Number.isInteger(s.comboBonusPerStep) || s.comboBonusPerStep < 0 || s.comboBonusPerStep > 50) {
    return "Combo bonus per step must be 0-50";
  }
  if (!Number.isInteger(s.comboBonusCap) || s.comboBonusCap < 1 || s.comboBonusCap > 20) {
    return "Combo bonus cap must be 1-20";
  }
  if (!Number.isInteger(s.allCorrectBonusVm) || s.allCorrectBonusVm < 0 || s.allCorrectBonusVm > 1000) {
    return "All-correct bonus must be 0-1000";
  }
  if (!Number.isInteger(s.dailyVmCap) || s.dailyVmCap < 0 || s.dailyVmCap > 5000) {
    return "Daily VM cap must be 0-5000";
  }
  return null;
}

export function PulseCheckScoringEditor({ scoring }: { scoring: PulseCheckScoring }) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState(scoring);

  const error = scoringError(form);

  function save() {
    startTransition(async () => {
      const result = await updatePulseCheckScoringAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Pulse Check scoring saved");
    });
  }

  return (
    <div className="max-w-2xl space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">Pulse Check scoring</h2>
        <p className="text-xs text-muted-foreground">
          Base VM per question comes from the quiz generator settings above. Every number here is
          from the original prototype (FEATURE_MAP NW-25/26) except the daily VM cap, which is a
          deliberately conservative starting value (see docs/ARCHITECTURE.md D51) - easy to raise
          after real usage data, painful to cut after launch.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Speed bonus threshold (% of timer)</Label>
          <Input
            type="number"
            value={form.speedBonusThresholdPct}
            onChange={(e) => setForm({ ...form, speedBonusThresholdPct: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label>Speed bonus VM</Label>
          <Input
            type="number"
            value={form.speedBonusVm}
            onChange={(e) => setForm({ ...form, speedBonusVm: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label>Combo bonus VM / step</Label>
          <Input
            type="number"
            value={form.comboBonusPerStep}
            onChange={(e) => setForm({ ...form, comboBonusPerStep: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label>Combo bonus cap (streak)</Label>
          <Input
            type="number"
            value={form.comboBonusCap}
            onChange={(e) => setForm({ ...form, comboBonusCap: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label>All-correct bonus VM</Label>
          <Input
            type="number"
            value={form.allCorrectBonusVm}
            onChange={(e) => setForm({ ...form, allCorrectBonusVm: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label className="font-semibold">Daily VM cap (D51)</Label>
          <Input
            type="number"
            value={form.dailyVmCap}
            onChange={(e) => setForm({ ...form, dailyVmCap: Number(e.target.value) })}
          />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button type="button" onClick={save} disabled={isPending || error !== null}>
        Save
      </Button>
    </div>
  );
}
