"use client";

import { Award } from "lucide-react";
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
  createBadgeDraftAction,
  publishBadgeAction,
  unpublishBadgeAction,
  updateBadgeDraftAction,
} from "./actions";

type BadgeRow = {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  category: "learning" | "streak" | "trading" | "news";
  criteria: { type: string; threshold: number };
  vmReward: number;
  iconKey: string | null;
  status: "draft" | "published";
};

const LANGUAGES = ["en", "hi", "hx"] as const;
const EMPTY_LOCALIZED: LocalizedText = { en: "", hi: "", hx: "" };
const CATEGORIES = ["learning", "streak", "trading", "news"] as const;
const CRITERIA_TYPES = ["lessons_completed", "streak_days", "quiz_accuracy_pct"] as const;

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

export function BadgeEditor({ badges, canManage }: { badges: BadgeRow[]; canManage: boolean }) {
  const [selectedId, setSelectedId] = useState<string | "new" | null>(badges[0]?.id ?? "new");

  if (badges.length === 0 && !canManage) {
    return <EmptyState icon={Award} title="No badges yet" description="A staff member with economy.manage can create the first one." />;
  }

  return (
    <div className="space-y-4">
      <Select value={selectedId ?? "new"} onValueChange={setSelectedId}>
        <SelectTrigger className="w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {badges.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name.en || "(untitled)"} ({b.status})
            </SelectItem>
          ))}
          {canManage && <SelectItem value="new">+ New badge</SelectItem>}
        </SelectContent>
      </Select>

      {selectedId === "new" && canManage ? (
        <BadgeForm canManage={canManage} />
      ) : (
        (() => {
          const badge = badges.find((b) => b.id === selectedId);
          if (!badge) return null;
          return <BadgeForm key={badge.id} badge={badge} canManage={canManage} />;
        })()
      )}
    </div>
  );
}

function BadgeForm({ badge, canManage }: { badge?: BadgeRow; canManage: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState<LocalizedText>(badge?.name ?? EMPTY_LOCALIZED);
  const [description, setDescription] = useState<LocalizedText>(badge?.description ?? EMPTY_LOCALIZED);
  const [category, setCategory] = useState<string>(badge?.category ?? "learning");
  const [criteriaType, setCriteriaType] = useState<string>(badge?.criteria.type ?? "lessons_completed");
  const [threshold, setThreshold] = useState(String(badge?.criteria.threshold ?? ""));
  const [vmReward, setVmReward] = useState(String(badge?.vmReward ?? ""));
  const [iconKey, setIconKey] = useState(badge?.iconKey ?? "");

  const isDraft = !badge || badge.status === "draft";
  const editable = canManage && isDraft;

  function payload() {
    return {
      name,
      description,
      category: category as BadgeRow["category"],
      criteria: { type: criteriaType, threshold: Number(threshold) },
      vmReward: Number(vmReward),
      iconKey: iconKey || null,
    };
  }

  function save() {
    startTransition(async () => {
      const result = badge
        ? await updateBadgeDraftAction({ id: badge.id, ...payload() })
        : await createBadgeDraftAction(payload());
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(badge ? "Draft saved" : "Badge created as a draft");
    });
  }

  function publish() {
    if (!badge) return;
    startTransition(async () => {
      const result = await publishBadgeAction({ id: badge.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Published");
    });
  }

  function unpublish() {
    if (!badge) return;
    startTransition(async () => {
      const result = await unpublishBadgeAction({ id: badge.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Unpublished - back to draft");
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      {badge && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <StatusBadge status={badge.status}>{badge.status}</StatusBadge>
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
          <Input value={iconKey} disabled={!editable} onChange={(e) => setIconKey(e.target.value)} placeholder="pehla-kadam" />
        </div>
        <div className="space-y-1">
          <Label>Criteria type</Label>
          <Select value={criteriaType} onValueChange={setCriteriaType} disabled={!editable}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CRITERIA_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Threshold</Label>
          <Input type="number" value={threshold} disabled={!editable} onChange={(e) => setThreshold(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>V Money reward</Label>
          <Input type="number" value={vmReward} disabled={!editable} onChange={(e) => setVmReward(e.target.value)} />
        </div>
      </div>

      <LocalizedFields label="Name" value={name} onChange={setName} disabled={!editable} />
      <LocalizedFields label="Description" value={description} onChange={setDescription} disabled={!editable} />

      <div className="flex gap-2">
        {editable && (
          <Button type="button" onClick={save} disabled={isPending || !threshold || !vmReward}>
            {badge ? "Save draft" : "Create draft"}
          </Button>
        )}
        {canManage && badge && isDraft && (
          <Button type="button" variant="outline" onClick={publish} disabled={isPending}>
            Publish
          </Button>
        )}
        {canManage && badge && !isDraft && (
          <Button type="button" variant="outline" onClick={unpublish} disabled={isPending}>
            Unpublish
          </Button>
        )}
      </div>
    </div>
  );
}
