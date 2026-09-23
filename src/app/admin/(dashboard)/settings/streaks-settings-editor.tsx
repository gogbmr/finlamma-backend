"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StreaksSettings } from "@/server/streaks/schemas";
import { updateStreaksSettingsAction } from "./actions";

export function StreaksSettingsEditor({ settings }: { settings: StreaksSettings }) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState(settings);

  function save() {
    startTransition(async () => {
      const result = await updateStreaksSettingsAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Streak settings saved");
    });
  }

  return (
    <div className="max-w-2xl space-y-4 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Streaks</h2>
      <p className="text-xs text-muted-foreground">
        How many missed IST calendar days per month a learner can have auto-covered without
        breaking their learning streak. Resets at the first activity of a new IST month.
      </p>
      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <Label>Freezes per month</Label>
          <Input
            type="number"
            className="w-32"
            value={form.streakFreezesPerMonth}
            onChange={(e) => setForm({ ...form, streakFreezesPerMonth: Number(e.target.value) })}
          />
        </div>
        <Button type="button" onClick={save} disabled={isPending}>
          Save
        </Button>
      </div>
    </div>
  );
}
