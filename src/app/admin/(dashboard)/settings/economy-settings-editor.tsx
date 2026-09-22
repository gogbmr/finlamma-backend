"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RewardActivityKind } from "@/server/economy/repo";
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

function RewardRuleRowEditor({ rule }: { rule: RewardRuleRow }) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState(rule);

  function save() {
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
    <TableRow>
      <TableCell className="font-medium">{ACTIVITY_KIND_LABEL[rule.activityKind]}</TableCell>
      <TableCell>
        <Input
          type="number"
          className="w-24"
          value={form.defaultXp}
          onChange={(e) => setForm({ ...form, defaultXp: Number(e.target.value) })}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          className="w-24"
          value={form.defaultVm}
          onChange={(e) => setForm({ ...form, defaultVm: Number(e.target.value) })}
        />
      </TableCell>
      <TableCell>
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
        />
      </TableCell>
      <TableCell>
        <Button type="button" size="sm" onClick={save} disabled={isPending}>
          Save
        </Button>
      </TableCell>
    </TableRow>
  );
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

  function saveMultiplier() {
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
          rules above. Stays at 1.0 unless the economy needs tuning after launch.
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
          </div>
          <Button type="button" onClick={saveMultiplier} disabled={isPending}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
