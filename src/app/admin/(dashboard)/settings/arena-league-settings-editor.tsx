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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GLASS_PANEL } from "@/components/admin/glass";
import { cn } from "@/lib/cn";
import type { LocalizedText } from "@/server/shared/schemas";
import { updateArenaLeagueSettingsAction } from "./actions";

type ArenaLeagueSettings = {
  promoteVmReward: number;
  safeVmReward: number;
  weeklyVmCap: number;
  cheerWeeklySenderReceiverCap: number;
  crestBadgeId: string | null;
};

type ExternalBadgeOption = { id: string; name: LocalizedText };

export function ArenaLeagueSettingsEditor({
  settings,
  externalBadges,
}: {
  settings: ArenaLeagueSettings;
  externalBadges: ExternalBadgeOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState(settings);
  // The "pristine" baseline to diff against - moves forward after a
  // successful save (this component is never remounted/re-keyed by its
  // parent, unlike Competitions' CompetitionForm), same reasoning as
  // Badges'/Rewards' savedSnapshot.
  const [saved, setSaved] = useState(settings);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function badgeLabel(id: string | null): string {
    if (!id) return "None - pay VM only, no badge";
    return externalBadges.find((b) => b.id === id)?.name.en ?? id;
  }

  const changedFields: ChangedFieldInput[] = [
    { label: "Promote-zone reward", oldValue: saved.promoteVmReward, newValue: form.promoteVmReward, kind: "vmoney" },
    { label: "Safe-zone reward", oldValue: saved.safeVmReward, newValue: form.safeVmReward, kind: "vmoney" },
    { label: "Weekly VM cap per learner", oldValue: saved.weeklyVmCap, newValue: form.weeklyVmCap, kind: "vmoney" },
    // XP, not V Money - never the "vmoney" kind/label.
    {
      label: "Cheer weekly cap, per sender-receiver pair (XP)",
      oldValue: saved.cheerWeeklySenderReceiverCap,
      newValue: form.cheerWeeklySenderReceiverCap,
    },
    { label: "Promote-zone crest badge", oldValue: badgeLabel(saved.crestBadgeId), newValue: badgeLabel(form.crestBadgeId) },
  ];

  function doSave() {
    startTransition(async () => {
      const result = await updateArenaLeagueSettingsAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Arena league settings saved");
      setSaved(form);
    });
  }

  function save() {
    setConfirmOpen(true);
  }

  return (
    <div className={cn(GLASS_PANEL, "max-w-3xl space-y-4 p-4")}>
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">Arena league settings</h2>
        <p className="text-xs text-muted-foreground">
          Weekly promote/safe/demote payouts (docs/ARCHITECTURE.md D55/D56). A learner is paid
          once, for their single best-qualifying zone across World/State/India/Global - never
          summed - and the total is clamped to the weekly cap below regardless.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="promoteVmReward">Promote-zone reward (VM)</Label>
          <Input
            id="promoteVmReward"
            type="number"
            value={form.promoteVmReward}
            onChange={(e) => setForm({ ...form, promoteVmReward: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="safeVmReward">Safe-zone reward (VM)</Label>
          <Input
            id="safeVmReward"
            type="number"
            value={form.safeVmReward}
            onChange={(e) => setForm({ ...form, safeVmReward: Number(e.target.value) })}
          />
          <p className="text-xs text-muted-foreground">
            Default 0 - landing in the middle ~50% isn&apos;t an achievement (D55). Raise it later
            if a rewardless week tests poorly.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="weeklyVmCap">Weekly VM cap per learner</Label>
          <Input
            id="weeklyVmCap"
            type="number"
            value={form.weeklyVmCap}
            onChange={(e) => setForm({ ...form, weeklyVmCap: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cheerWeeklySenderReceiverCap">Cheer weekly cap, per sender-receiver pair (XP)</Label>
          <Input
            id="cheerWeeklySenderReceiverCap"
            type="number"
            value={form.cheerWeeklySenderReceiverCap}
            onChange={(e) => setForm({ ...form, cheerWeeklySenderReceiverCap: Number(e.target.value) })}
          />
          <p className="text-xs text-muted-foreground">
            Closes a collusion gap (D56): the same two accounts cheering each other every day would
            otherwise net XP toward league rank all week.
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="crestBadgeId">Promote-zone crest badge</Label>
        <Select
          value={form.crestBadgeId ?? "none"}
          onValueChange={(value) => setForm({ ...form, crestBadgeId: value === "none" ? null : value })}
        >
          <SelectTrigger id="crestBadgeId" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None - pay VM only, no badge</SelectItem>
            {externalBadges.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name.en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Only badges with criteria type &quot;external&quot; appear here - create one in the Badges
          editor first if the list is empty.
        </p>
      </div>

      <Button type="button" onClick={save} disabled={isPending}>
        Save
      </Button>

      <ConfirmChangesDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Save Arena league settings?"
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
