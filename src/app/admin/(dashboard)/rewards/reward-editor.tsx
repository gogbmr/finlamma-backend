"use client";

import { Gift } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { LocalizedText } from "@/server/shared/schemas";
import {
  createRewardDraftAction,
  publishRewardAction,
  unpublishRewardAction,
  updateRewardDraftAction,
} from "./actions";

type RewardRow = {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  category: "finlamma" | "brand_partner";
  priceVm: number;
  iconKey: string | null;
  status: "draft" | "published";
};

const LANGUAGES = ["en", "hi", "hx"] as const;
const EMPTY_LOCALIZED: LocalizedText = { en: "", hi: "", hx: "" };
const CATEGORIES = ["finlamma", "brand_partner"] as const;

function LocalizedFields({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: LocalizedText;
  onChange: (value: LocalizedText) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      {LANGUAGES.map((lang) => (
        <div key={lang} className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase">{lang}</label>
          <Textarea value={value[lang]} disabled={disabled} onChange={(e) => onChange({ ...value, [lang]: e.target.value })} />
        </div>
      ))}
    </div>
  );
}

export function RewardEditor({ rewards, canManage }: { rewards: RewardRow[]; canManage: boolean }) {
  const [selectedId, setSelectedId] = useState<string | "new" | null>(rewards[0]?.id ?? "new");

  if (rewards.length === 0 && !canManage) {
    return <EmptyState icon={Gift} title="No rewards yet" description="A staff member with economy.manage can create the first one." />;
  }

  return (
    <div className="space-y-4">
      <Select value={selectedId ?? "new"} onValueChange={setSelectedId}>
        <SelectTrigger className="w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {rewards.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name.en || "(untitled)"} ({r.status})
            </SelectItem>
          ))}
          {canManage && <SelectItem value="new">+ New reward</SelectItem>}
        </SelectContent>
      </Select>

      {selectedId === "new" && canManage ? (
        <RewardForm canManage={canManage} />
      ) : (
        (() => {
          const reward = rewards.find((r) => r.id === selectedId);
          if (!reward) return null;
          return <RewardForm key={reward.id} reward={reward} canManage={canManage} />;
        })()
      )}
    </div>
  );
}

function RewardForm({ reward, canManage }: { reward?: RewardRow; canManage: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState<LocalizedText>(reward?.name ?? EMPTY_LOCALIZED);
  const [description, setDescription] = useState<LocalizedText>(reward?.description ?? EMPTY_LOCALIZED);
  const [category, setCategory] = useState<string>(reward?.category ?? "finlamma");
  const [priceVm, setPriceVm] = useState(String(reward?.priceVm ?? ""));
  const [iconKey, setIconKey] = useState(reward?.iconKey ?? "");

  const isDraft = !reward || reward.status === "draft";
  const editable = canManage && isDraft;

  function payload() {
    return {
      name,
      description,
      category: category as RewardRow["category"],
      priceVm: Number(priceVm),
      iconKey: iconKey || null,
    };
  }

  function save() {
    startTransition(async () => {
      const result = reward
        ? await updateRewardDraftAction({ id: reward.id, ...payload() })
        : await createRewardDraftAction(payload());
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(reward ? "Draft saved" : "Reward created as a draft");
    });
  }

  function publish() {
    if (!reward) return;
    startTransition(async () => {
      const result = await publishRewardAction({ id: reward.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Published");
    });
  }

  function unpublish() {
    if (!reward) return;
    startTransition(async () => {
      const result = await unpublishRewardAction({ id: reward.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Unpublished - back to draft");
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      {reward && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <StatusBadge status={reward.status}>{reward.status}</StatusBadge>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory} disabled={!editable}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Icon key (optional)</Label>
          <Input value={iconKey} disabled={!editable} onChange={(e) => setIconKey(e.target.value)} placeholder="dark-theme" />
        </div>
        <div className="space-y-1">
          <Label>Price (V Money)</Label>
          <Input type="number" value={priceVm} disabled={!editable} onChange={(e) => setPriceVm(e.target.value)} />
          <p className="text-xs text-muted-foreground">Fixed - never scales with the learner&apos;s own balance.</p>
        </div>
      </div>

      <LocalizedFields label="Name" value={name} onChange={setName} disabled={!editable} />
      <LocalizedFields label="Description" value={description} onChange={setDescription} disabled={!editable} />

      <div className="flex gap-2">
        {editable && (
          <Button type="button" onClick={save} disabled={isPending || !priceVm}>
            {reward ? "Save draft" : "Create draft"}
          </Button>
        )}
        {canManage && reward && isDraft && (
          <Button type="button" variant="outline" onClick={publish} disabled={isPending}>
            Publish
          </Button>
        )}
        {canManage && reward && !isDraft && (
          <Button type="button" variant="outline" onClick={unpublish} disabled={isPending}>
            Unpublish
          </Button>
        )}
      </div>
    </div>
  );
}
