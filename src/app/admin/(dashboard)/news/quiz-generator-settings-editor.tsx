"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateNewsQuizGeneratorSettingsAction } from "./actions";

type Format =
  | "single_select"
  | "ordering"
  | "sort_buckets"
  | "fill_blank"
  | "match_pairs"
  | "spot_mistake"
  | "number_guess";

const FORMAT_LABEL: Record<Format, string> = {
  single_select: "Quick Check (MCQ / Sach ya Afwah / Odd One Out)",
  ordering: "Sabse Bada Asar (ordering)",
  sort_buckets: "Achhi ya Buri Khabar (sort)",
  fill_blank: "Khaali Bharo (fill blank)",
  match_pairs: "Jodi Banao (match pairs)",
  spot_mistake: "Fake Pakdo (spot the fake)",
  number_guess: "Number Pakdo (slider)",
};
const ALL_FORMATS = Object.keys(FORMAT_LABEL) as Format[];

export type QuizGeneratorSettings = {
  questionCount: number;
  perQuestionTimerSeconds: number;
  baseVmPerQuestion: number;
  enabledFormats: Format[];
};

function settingsError(s: QuizGeneratorSettings): string | null {
  if (!Number.isInteger(s.questionCount) || s.questionCount < 4 || s.questionCount > 20) {
    return "Question count must be 4-20";
  }
  if (!Number.isInteger(s.perQuestionTimerSeconds) || s.perQuestionTimerSeconds < 10 || s.perQuestionTimerSeconds > 35) {
    return "Per-question timer must be 10-35 seconds";
  }
  if (!Number.isInteger(s.baseVmPerQuestion) || s.baseVmPerQuestion <= 0) {
    return "Base V Money per question must be a positive whole number";
  }
  if (s.enabledFormats.length === 0) return "At least one format must be enabled";
  return null;
}

export function QuizGeneratorSettingsEditor({ settings }: { settings: QuizGeneratorSettings }) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState(settings);

  const error = settingsError(form);

  function toggleFormat(format: Format) {
    setForm((f) => ({
      ...f,
      enabledFormats: f.enabledFormats.includes(format)
        ? f.enabledFormats.filter((x) => x !== format)
        : [...f.enabledFormats, format],
    }));
  }

  function save() {
    startTransition(async () => {
      const result = await updateNewsQuizGeneratorSettingsAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Quiz generator settings saved");
    });
  }

  return (
    <div className="max-w-2xl space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">Pulse Check quiz generator</h2>
        <p className="text-xs text-muted-foreground">
          Settings for today&apos;s and future editions. Changing these does not retroactively
          affect an edition already served to a learner.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>Question count (4-20)</Label>
          <Input
            type="number"
            value={form.questionCount}
            onChange={(e) => setForm({ ...form, questionCount: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label>Per-question timer (10-35s)</Label>
          <Input
            type="number"
            value={form.perQuestionTimerSeconds}
            onChange={(e) => setForm({ ...form, perQuestionTimerSeconds: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label>Base V Money / question</Label>
          <Input
            type="number"
            value={form.baseVmPerQuestion}
            onChange={(e) => setForm({ ...form, baseVmPerQuestion: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Enabled formats</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {ALL_FORMATS.map((format) => (
            <label key={format} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.enabledFormats.includes(format)}
                onChange={() => toggleFormat(format)}
              />
              {FORMAT_LABEL[format]}
            </label>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Max payout for a full session: {form.questionCount * form.baseVmPerQuestion} VM (base only,
        before speed/combo/all-correct bonuses).
      </p>

      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button type="button" onClick={save} disabled={isPending || error !== null}>
        Save
      </Button>
    </div>
  );
}
