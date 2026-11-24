"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type ChangedFieldInput,
  ConfirmChangesDialog,
  diffChangedFields,
} from "@/components/admin/confirm-changes-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GLASS_PANEL } from "@/components/admin/glass";
import { cn } from "@/lib/cn";
import type { LessonFlowScoring } from "@/server/settings/schemas";
import { updateLessonFlowScoringAction } from "./actions";

// Every field here is XP, a percentage, a count or a duration - never V
// Money - so none of these ever use the "vmoney" kind/label, even though
// this page lives under the same "money-related" umbrella as the others.

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
  // The "pristine" baseline to diff against - moves forward after a
  // successful save, same reasoning as the Arena league editor.
  const [saved, setSaved] = useState<LessonFlowScoring>(scoring);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const changedFields: ChangedFieldInput[] = [
    { label: "Pop quiz - correct XP", oldValue: saved.popQuiz.correctXp, newValue: form.popQuiz.correctXp },
    { label: "Pop quiz - wrong XP", oldValue: saved.popQuiz.wrongXp, newValue: form.popQuiz.wrongXp },
    { label: "Practice quiz - correct XP", oldValue: saved.practiceQuiz.correctXp, newValue: form.practiceQuiz.correctXp },
    { label: "Practice quiz - wrong XP", oldValue: saved.practiceQuiz.wrongXp, newValue: form.practiceQuiz.wrongXp },
    { label: "Practice quiz timer (seconds)", oldValue: saved.practiceQuizTimerSeconds, newValue: form.practiceQuizTimerSeconds },
    { label: "Speed bonus threshold (%)", oldValue: saved.speedBonusThresholdPct, newValue: form.speedBonusThresholdPct },
    { label: "Speed bonus XP", oldValue: saved.speedBonusXp, newValue: form.speedBonusXp },
    { label: "Combo bonus per step", oldValue: saved.comboBonusPerStep, newValue: form.comboBonusPerStep },
    { label: "Combo bonus cap", oldValue: saved.comboBonusCap, newValue: form.comboBonusCap },
    { label: "Fever combo threshold", oldValue: saved.feverComboThreshold, newValue: form.feverComboThreshold },
    { label: "Fever multiplier", oldValue: saved.feverMultiplier, newValue: form.feverMultiplier },
    { label: "Boss Quiz pass mark (%)", oldValue: saved.bossQuizPassMarkPct, newValue: form.bossQuizPassMarkPct },
    { label: "Lesson pass mark (%)", oldValue: saved.lessonPassMarkPct, newValue: form.lessonPassMarkPct },
    { label: "Story min. completion (seconds)", oldValue: saved.storyMinCompletionSeconds, newValue: form.storyMinCompletionSeconds },
    { label: "Doubt Zone min. completion (seconds)", oldValue: saved.doubtZoneMinCompletionSeconds, newValue: form.doubtZoneMinCompletionSeconds },
    { label: "Trading unlocks after world position", oldValue: saved.tradingUnlockAfterWorldPosition, newValue: form.tradingUnlockAfterWorldPosition },
  ];

  function doSave() {
    startTransition(async () => {
      const result = await updateLessonFlowScoringAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Scoring settings saved - live immediately for every learner");
      setSaved(form);
    });
  }

  function save() {
    setConfirmOpen(true);
  }

  return (
    <div className={cn(GLASS_PANEL, "max-w-2xl space-y-4 p-4")}>
      <h2 className="text-sm font-semibold text-foreground">Lesson Flow scoring</h2>
      <p className="text-xs text-muted-foreground">
        Video pop quiz (LF-12) and lesson practice quiz (LF-22) each have their own base XP; speed
        bonus, combo and fever mode are shared.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          label="Story min. completion time (seconds)"
          value={form.storyMinCompletionSeconds}
          onChange={(v) => setForm({ ...form, storyMinCompletionSeconds: v })}
        />
        <NumberField
          label="Doubt Zone min. completion time (seconds)"
          value={form.doubtZoneMinCompletionSeconds}
          onChange={(v) => setForm({ ...form, doubtZoneMinCompletionSeconds: v })}
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
        credits. Story and Doubt Zone have no accuracy gate (no graded questions) - instead they
        require the minimum completion time below, measured server-side from when the lesson was
        served.
      </p>
      <p className="text-xs text-muted-foreground">
        Trading unlocks once a learner passes the Boss Quiz of the published world at this
        position (1st, 2nd, 3rd published world, etc.) - not a specific world by name, so it
        keeps working if worlds are added, removed or reordered.
      </p>

      <Button type="button" onClick={save} disabled={isPending}>
        Save
      </Button>

      <ConfirmChangesDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Save Lesson Flow scoring settings?"
        fields={diffChangedFields(changedFields)}
        pending={isPending}
        onConfirm={() => {
          setConfirmOpen(false);
          doSave();
        }}
      />
    </div>
  );
}
