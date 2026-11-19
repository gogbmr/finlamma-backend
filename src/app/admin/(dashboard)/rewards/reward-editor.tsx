"use client";

import { Gift } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type ChangedFieldInput,
  ConfirmChangesDialog,
  diffChangedFields,
} from "@/components/admin/confirm-changes-dialog";
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
import { RewardsTable } from "./rewards-table";

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

export function RewardEditor({
  rewards,
  canManage,
  total,
  page,
  pageCount,
  pageSize,
  q,
  sort,
  dir,
  status,
}: {
  rewards: RewardRow[];
  canManage: boolean;
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  q: string;
  sort: string | null;
  dir: "asc" | "desc";
  status: "draft" | "published" | null;
}) {
  const [selectedId, setSelectedId] = useState<string | "new" | null>(rewards[0]?.id ?? "new");
  // Few-line confirm() guard, same pattern as Worlds/Mentors/Badges -
  // doesn't cover Prev/Next/search/sort/status, deferred to Task 4.
  const [isDirty, setIsDirty] = useState(false);

  function trySelect(id: string | "new") {
    if (
      isDirty &&
      typeof window !== "undefined" &&
      !window.confirm("Discard unsaved changes to this reward?")
    ) {
      return;
    }
    setIsDirty(false);
    setSelectedId(id);
  }

  if (total === 0 && !canManage) {
    return <EmptyState icon={Gift} title="No rewards yet" description="A staff member with economy.manage can create the first one." />;
  }

  const effectiveId: string | "new" =
    selectedId === "new" || rewards.some((r) => r.id === selectedId)
      ? (selectedId as string | "new")
      : rewards[0]?.id ?? "new";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Select a reward below to edit it.</p>
        {canManage && (
          <Button type="button" size="sm" onClick={() => trySelect("new")}>
            + New reward
          </Button>
        )}
      </div>

      <RewardsTable
        rows={rewards.map((r) => ({ id: r.id, name: r.name, category: r.category, priceVm: r.priceVm, status: r.status }))}
        total={total}
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        q={q}
        sort={sort}
        dir={dir}
        status={status}
        selectedId={effectiveId}
        onSelect={trySelect}
      />

      {effectiveId === "new" && canManage ? (
        <RewardForm canManage={canManage} onDirtyChange={setIsDirty} />
      ) : (
        (() => {
          const reward = rewards.find((r) => r.id === effectiveId);
          if (!reward) return null;
          return (
            <RewardForm key={reward.id} reward={reward} canManage={canManage} onDirtyChange={setIsDirty} />
          );
        })()
      )}
    </div>
  );
}

function RewardForm({
  reward,
  canManage,
  onDirtyChange,
}: {
  reward?: RewardRow;
  canManage: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState<LocalizedText>(reward?.name ?? EMPTY_LOCALIZED);
  const [description, setDescription] = useState<LocalizedText>(reward?.description ?? EMPTY_LOCALIZED);
  const [category, setCategory] = useState<string>(reward?.category ?? "finlamma");
  const [priceVm, setPriceVm] = useState(String(reward?.priceVm ?? ""));
  const [iconKey, setIconKey] = useState(reward?.iconKey ?? "");

  // One form serves both create and edit - same reasoning as Badges'
  // BadgeForm for why the baseline is the loaded reward's fields (or this
  // form's own empty defaults when creating), moving forward after save.
  const [savedSnapshot, setSavedSnapshot] = useState(
    reward
      ? {
          name: reward.name,
          description: reward.description,
          category: reward.category as string,
          priceVm: String(reward.priceVm),
          iconKey: reward.iconKey ?? "",
        }
      : {
          name: EMPTY_LOCALIZED,
          description: EMPTY_LOCALIZED,
          category: "finlamma",
          priceVm: "",
          iconKey: "",
        },
  );

  const dirty =
    LANGUAGES.some((l) => name[l] !== savedSnapshot.name[l]) ||
    LANGUAGES.some((l) => description[l] !== savedSnapshot.description[l]) ||
    category !== savedSnapshot.category ||
    priceVm !== savedSnapshot.priceVm ||
    iconKey !== savedSnapshot.iconKey;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const isDraft = !reward || reward.status === "draft";
  const editable = canManage && isDraft;

  const [confirmOpen, setConfirmOpen] = useState(false);

  function payload() {
    return {
      name,
      description,
      category: category as RewardRow["category"],
      priceVm: Number(priceVm),
      iconKey: iconKey || null,
    };
  }

  // Task 7: review-before-save only applies to editing an EXISTING reward -
  // creating a brand-new one has no "old" value worth confirming against.
  const changedFields: ChangedFieldInput[] = [
    { label: "Category", oldValue: savedSnapshot.category, newValue: category },
    { label: "Icon key", oldValue: savedSnapshot.iconKey || null, newValue: iconKey || null },
    { label: "Price", oldValue: Number(savedSnapshot.priceVm) || 0, newValue: Number(priceVm) || 0, kind: "vmoney" },
    { label: "Name (en)", oldValue: savedSnapshot.name.en, newValue: name.en },
    { label: "Name (hi)", oldValue: savedSnapshot.name.hi, newValue: name.hi },
    { label: "Name (hx)", oldValue: savedSnapshot.name.hx, newValue: name.hx },
    { label: "Description (en)", oldValue: savedSnapshot.description.en, newValue: description.en },
    { label: "Description (hi)", oldValue: savedSnapshot.description.hi, newValue: description.hi },
    { label: "Description (hx)", oldValue: savedSnapshot.description.hx, newValue: description.hx },
  ];

  function doSave() {
    startTransition(async () => {
      const result = reward
        ? await updateRewardDraftAction({ id: reward.id, ...payload() })
        : await createRewardDraftAction(payload());
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(reward ? "Draft saved" : "Reward created as a draft");
      setSavedSnapshot({ name, description, category, priceVm, iconKey });
    });
  }

  function save() {
    if (reward) {
      setConfirmOpen(true);
      return;
    }
    doSave();
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

      {reward && (
        <ConfirmChangesDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Save changes to "${reward.name.en || reward.id}"?`}
          fields={diffChangedFields(changedFields)}
          pending={isPending}
          onConfirm={() => {
            setConfirmOpen(false);
            doSave();
          }}
        />
      )}
    </div>
  );
}
