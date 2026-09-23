"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LevelCurveSettings } from "@/server/leveling/schemas";
import { updateLevelCurveSettingsAction } from "./actions";

function levelCurveError(form: LevelCurveSettings): string | null {
  if (!Number.isInteger(form.baseXp) || form.baseXp < 1) return "Base XP must be a whole number, 1 or more";
  if (!Number.isInteger(form.stepXp) || form.stepXp < 0) return "Step XP must be a whole number, 0 or more";
  return null;
}

export function LevelCurveSettingsEditor({ settings }: { settings: LevelCurveSettings }) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState(settings);
  const error = levelCurveError(form);

  function save() {
    startTransition(async () => {
      const result = await updateLevelCurveSettingsAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Level curve saved - every learner's level re-derives from this on their next read");
    });
  }

  return (
    <div className="max-w-2xl space-y-4 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Level curve</h2>
      <p className="text-xs text-muted-foreground">
        XP required to advance from level L to L+1 = base + step × (L−1). A learner&apos;s level is
        always derived from their total XP using this curve - it is never stored, so changing
        these numbers changes every learner&apos;s displayed level immediately, with no backfill.
      </p>
      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <Label>Base XP (level 1 cost)</Label>
          <Input
            type="number"
            className="w-32"
            value={form.baseXp}
            onChange={(e) => setForm({ ...form, baseXp: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label>Step XP (per level)</Label>
          <Input
            type="number"
            className="w-32"
            value={form.stepXp}
            onChange={(e) => setForm({ ...form, stepXp: Number(e.target.value) })}
          />
        </div>
        <Button type="button" onClick={save} disabled={isPending || error !== null}>
          Save
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
