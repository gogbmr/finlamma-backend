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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RewardActivityKind } from "@/server/economy/repo";
import {
  MAX_REWARD_AMOUNT,
  VM_ISSUANCE_MULTIPLIER_MAX,
  VM_ISSUANCE_MULTIPLIER_MIN,
} from "@/server/economy/schemas";
import { updateRewardRuleAction, updateVmIssuanceMultiplierAction } from "./actions";

type RewardRuleRow = {
  activityKind: RewardActivityKind;
  defaultXp: number;
  defaultVm: number;
  active: boolean;
};

const ACTIVITY_KIND_LABEL: Record<RewardActivityKind, string> = {
  video: "Video",
  story: "Story",
  ai_chat: "AI Chat (Doubt Zone)",
  role_play: "Role Play",
  quiz: "Quiz",
  boss_quiz: "Boss Quiz",
};

function rewardAmountError(value: number): string | null {
  if (!Number.isInteger(value) || value < 0) return "Must be a whole number, 0 or more";
  if (value > MAX_REWARD_AMOUNT) return `Must be at most ${MAX_REWARD_AMOUNT}`;
  return null;
}

function RewardRuleRowEditor({ rule }: { rule: RewardRuleRow }) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState(rule);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const xpError = rewardAmountError(form.defaultXp);
  const vmError = rewardAmountError(form.defaultVm);
  const hasError = xpError !== null || vmError !== null;

  function confirmSave() {
    setConfirmOpen(false);
    startTransition(async () => {
      const result = await updateRewardRuleAction(rule.activityKind, {
        defaultXp: form.defaultXp,
        defaultVm: form.defaultVm,
        active: form.active,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${ACTIVITY_KIND_LABEL[rule.activityKind]} reward saved`);
    });
  }

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">{ACTIVITY_KIND_LABEL[rule.activityKind]}</TableCell>
        <TableCell>
          <Input
            type="number"
            className="w-24"
            value={form.defaultXp}
            onChange={(e) => setForm({ ...form, defaultXp: Number(e.target.value) })}
          />
          {xpError && <p className="text-xs text-destructive">{xpError}</p>}
        </TableCell>
        <TableCell>
          <Input
            type="number"
            className="w-24"
            value={form.defaultVm}
            onChange={(e) => setForm({ ...form, defaultVm: Number(e.target.value) })}
          />
          {vmError && <p className="text-xs text-destructive">{vmError}</p>}
        </TableCell>
        <TableCell>
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
        </TableCell>
        <TableCell>
          <Button
            type="button"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={isPending || hasError}
          >
            Save
          </Button>
        </TableCell>
      </TableRow>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change {ACTIVITY_KIND_LABEL[rule.activityKind]} reward?</AlertDialogTitle>
            <AlertDialogDescription>
              {rule.defaultXp} XP / {rule.defaultVm} VM → <strong>{form.defaultXp} XP / {form.defaultVm} VM</strong>
              {form.active !== rule.active && (
                <> · {form.active ? "activating" : "deactivating"} this rule</>
              )}
              . This applies to every learner&apos;s next completion of this lesson kind, immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSave}>Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function multiplierError(value: number): string | null {
  if (!Number.isFinite(value) || value <= VM_ISSUANCE_MULTIPLIER_MIN) return "Must be greater than 0";
  if (value > VM_ISSUANCE_MULTIPLIER_MAX) return `Must be at most ${VM_ISSUANCE_MULTIPLIER_MAX}`;
  return null;
}

export function EconomySettingsEditor({
  rewardRules,
  vmIssuanceMultiplier,
}: {
  rewardRules: RewardRuleRow[];
  vmIssuanceMultiplier: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [multiplier, setMultiplier] = useState(vmIssuanceMultiplier);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const error = multiplierError(multiplier);

  function confirmSaveMultiplier() {
    setConfirmOpen(false);
    startTransition(async () => {
      const result = await updateVmIssuanceMultiplierAction(multiplier);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("VM issuance multiplier saved - applies to every credit from now on");
    });
  }

  return (
    <div className="max-w-3xl space-y-6 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">Reward rules</h2>
        <p className="text-xs text-muted-foreground">
          Default XP and V Money paid per lesson kind, on first successful completion (see
          docs/ECONOMY.md). An individual lesson may still override its kind&apos;s default.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Activity kind</TableHead>
            <TableHead>XP</TableHead>
            <TableHead>V Money</TableHead>
            <TableHead>Active</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rewardRules.map((rule) => (
            <RewardRuleRowEditor key={rule.activityKind} rule={rule} />
          ))}
        </TableBody>
      </Table>

      <div className="space-y-1 border-t border-border pt-4">
        <h2 className="text-sm font-semibold text-foreground">VM issuance multiplier</h2>
        <p className="text-xs text-muted-foreground">
          Scales every V Money award at the moment it&apos;s credited, without touching the reward
          rules above. Stays at 1.0 unless the economy needs tuning after launch. Must be greater
          than 0 and at most {VM_ISSUANCE_MULTIPLIER_MAX}.
        </p>
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label>Multiplier</Label>
            <Input
              type="number"
              step={0.05}
              className="w-32"
              value={multiplier}
              onChange={(e) => setMultiplier(Number(e.target.value))}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <Button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={isPending || error !== null}
          >
            Save
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change the VM issuance multiplier?</AlertDialogTitle>
            <AlertDialogDescription>
              {vmIssuanceMultiplier}× → <strong>{multiplier}×</strong>. This scales every V Money
              award for every learner, starting with their next completed lesson.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSaveMultiplier}>Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
