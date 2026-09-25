"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DailyGoalsSettings } from "@/server/daily-goals/schemas";
import { updateDailyGoalsSettingsAction } from "./actions";

const GOAL_LABELS: Record<string, string> = {
  study_minutes: "Study minutes",
  lesson_completed: "Lessons completed",
  pulse_check: "Pulse Check (Phase 5 - no data source yet)",
};

export function DailyGoalsSettingsEditor({ settings }: { settings: DailyGoalsSettings }) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState(settings);

  function save() {
    startTransition(async () => {
      const result = await updateDailyGoalsSettingsAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Daily goal settings saved");
    });
  }

  return (
    <div className="max-w-2xl space-y-4 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Daily goals</h2>
      <p className="text-xs text-muted-foreground">
        Which goals show on the Profile Overview&apos;s daily goal meter, and their targets.
        Turning a goal on/off or changing its target takes effect immediately for every learner -
        this never awards XP or V Money by itself, it only displays progress toward these
        thresholds. Adding a brand-new goal type needs a code change (an evaluator), not just a
        setting.
      </p>
      <div className="space-y-3">
        {form.map((goal, i) => (
          <div key={goal.type} className="flex items-end gap-3 border-b border-border pb-3 last:border-0">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 rounded border-border"
                checked={goal.active}
                onChange={(e) =>
                  setForm(form.map((g, j) => (i === j ? { ...g, active: e.target.checked } : g)))
                }
              />
              <Label>{GOAL_LABELS[goal.type] ?? goal.type}</Label>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Target</Label>
              <Input
                type="number"
                className="w-24"
                value={goal.target}
                onChange={(e) =>
                  setForm(form.map((g, j) => (i === j ? { ...g, target: Number(e.target.value) } : g)))
                }
              />
            </div>
          </div>
        ))}
      </div>
      <Button type="button" onClick={save} disabled={isPending}>
        Save
      </Button>
    </div>
  );
}
