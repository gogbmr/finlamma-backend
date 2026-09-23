"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LessonFlowScoring } from "@/server/settings/schemas";
import { updateLessonFlowScoringAction } from "./actions";

function NumberField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function ScoringSettingsEditor({ scoring }: { scoring: LessonFlowScoring }) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<LessonFlowScoring>(scoring);

  function save() {
    startTransition(async () => {
      const result = await updateLessonFlowScoringAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Scoring settings saved - live immediately for every learner");
    });
  }

  return (
    <div className="max-w-2xl space-y-4 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Lesson Flow scoring</h2>
      <p className="text-xs text-muted-foreground">
        Video pop quiz (LF-12) and lesson practice quiz (LF-22) each have their own base XP; speed
        bonus, combo and fever mode are shared.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Pop quiz - correct XP"
          value={form.popQuiz.correctXp}
          onChange={(v) => setForm({ ...form, popQuiz: { ...form.popQuiz, correctXp: v } })}
        />
        <NumberField
          label="Pop quiz - wrong XP"
          value={form.popQuiz.wrongXp}
          onChange={(v) => setForm({ ...form, popQuiz: { ...form.popQuiz, wrongXp: v } })}
        />
        <NumberField
          label="Practice quiz - correct XP"
          value={form.practiceQuiz.correctXp}
          onChange={(v) => setForm({ ...form, practiceQuiz: { ...form.practiceQuiz, correctXp: v } })}
        />
        <NumberField
          label="Practice quiz - wrong XP"
          value={form.practiceQuiz.wrongXp}
          onChange={(v) => setForm({ ...form, practiceQuiz: { ...form.practiceQuiz, wrongXp: v } })}
        />
        <NumberField
          label="Practice quiz timer (seconds)"
          value={form.practiceQuizTimerSeconds}
          onChange={(v) => setForm({ ...form, practiceQuizTimerSeconds: v })}
        />
        <NumberField
          label="Speed bonus threshold (% of timer)"
          value={form.speedBonusThresholdPct}
          onChange={(v) => setForm({ ...form, speedBonusThresholdPct: v })}
        />
        <NumberField
          label="Speed bonus XP"
          value={form.speedBonusXp}
          onChange={(v) => setForm({ ...form, speedBonusXp: v })}
        />
        <NumberField
          label="Combo bonus per step"
          value={form.comboBonusPerStep}
          onChange={(v) => setForm({ ...form, comboBonusPerStep: v })}
        />
        <NumberField
          label="Combo bonus cap"
          value={form.comboBonusCap}
          onChange={(v) => setForm({ ...form, comboBonusCap: v })}
        />
        <NumberField
          label="Fever combo threshold"
          value={form.feverComboThreshold}
          onChange={(v) => setForm({ ...form, feverComboThreshold: v })}
        />
        <NumberField
          label="Fever multiplier"
          step={0.1}
          value={form.feverMultiplier}
          onChange={(v) => setForm({ ...form, feverMultiplier: v })}
        />
        <NumberField
          label="Boss Quiz pass mark (%)"
          value={form.bossQuizPassMarkPct}
          onChange={(v) => setForm({ ...form, bossQuizPassMarkPct: v })}
        />
        <NumberField
          label="Lesson pass mark (%) - Video/Quiz/Role Play"
          value={form.lessonPassMarkPct}
          onChange={(v) => setForm({ ...form, lessonPassMarkPct: v })}
        />
        <NumberField
          label="Trading unlocks after world position"
          value={form.tradingUnlockAfterWorldPosition}
          onChange={(v) => setForm({ ...form, tradingUnlockAfterWorldPosition: v })}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        A Boss Quiz attempt below the pass mark doesn&apos;t unlock the next world - the learner
        can simply retry.
      </p>
      <p className="text-xs text-muted-foreground">
        A Video/Quiz/Role Play attempt below its own (lower) pass mark doesn&apos;t earn XP/V
        Money - the learner can simply retry, and the first passing attempt is the one that
        credits. Story and Doubt Zone have no accuracy gate (no graded questions).
      </p>
      <p className="text-xs text-muted-foreground">
        Trading unlocks once a learner passes the Boss Quiz of the published world at this
        position (1st, 2nd, 3rd published world, etc.) - not a specific world by name, so it
        keeps working if worlds are added, removed or reordered.
      </p>

      <Button type="button" onClick={save} disabled={isPending}>
        Save
      </Button>
    </div>
  );
}
