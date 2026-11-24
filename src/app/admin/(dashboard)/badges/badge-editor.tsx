"use client";

import { Award } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type ChangedFieldInput,
  ConfirmChangesDialog,
  diffChangedFields,
} from "@/components/admin/confirm-changes-dialog";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { GLASS_PANEL } from "@/components/admin/glass";
import { cn } from "@/lib/cn";
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
  uploadBadgeIconAction,
} from "./actions";
import { BadgesTable } from "./badges-table";

type BadgeRow = {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  category: "learning" | "streak" | "trading" | "news";
  criteria: { type: string; threshold: number };
  vmReward: number;
  iconKey: string | null;
  iconUrl: string | null;
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

export function BadgeEditor({
  badges,
  canCreate,
  canEdit,
  total,
  page,
  pageCount,
  pageSize,
  q,
  sort,
  dir,
  status,
}: {
  badges: BadgeRow[];
  canCreate: boolean;
  canEdit: boolean;
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  q: string;
  sort: string | null;
  dir: "asc" | "desc";
  status: "draft" | "published" | null;
}) {
  const [selectedId, setSelectedId] = useState<string | "new" | null>(badges[0]?.id ?? "new");
  // Few-line confirm() guard, same pattern as Worlds/Mentors - doesn't
  // cover Prev/Next/search/sort/status (plain <Link>s), deferred to Task 4.
  const [isDirty, setIsDirty] = useState(false);

  function trySelect(id: string | "new") {
    if (
      isDirty &&
      typeof window !== "undefined" &&
      !window.confirm("Discard unsaved changes to this badge?")
    ) {
      return;
    }
    setIsDirty(false);
    setSelectedId(id);
  }

  if (total === 0 && !canCreate) {
    return <EmptyState icon={Award} title="No badges yet" description="A staff member with badge.create can create the first one." />;
  }

  const effectiveId: string | "new" =
    selectedId === "new" || badges.some((b) => b.id === selectedId)
      ? (selectedId as string | "new")
      : badges[0]?.id ?? "new";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Select a badge below to edit it.</p>
        {canCreate && (
          <Button type="button" size="sm" onClick={() => trySelect("new")}>
            + New badge
          </Button>
        )}
      </div>

      <BadgesTable
        rows={badges.map((b) => ({ id: b.id, name: b.name, category: b.category, vmReward: b.vmReward, status: b.status }))}
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

      {effectiveId === "new" && canCreate ? (
        <BadgeForm canManage={canCreate} onDirtyChange={setIsDirty} />
      ) : (
        (() => {
          const badge = badges.find((b) => b.id === effectiveId);
          if (!badge) return null;
          return (
            <BadgeForm key={badge.id} badge={badge} canManage={canEdit} onDirtyChange={setIsDirty} />
          );
        })()
      )}
    </div>
  );
}

function BadgeForm({
  badge,
  canManage,
  onDirtyChange,
}: {
  badge?: BadgeRow;
  canManage: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<LocalizedText>(badge?.name ?? EMPTY_LOCALIZED);
  const [description, setDescription] = useState<LocalizedText>(badge?.description ?? EMPTY_LOCALIZED);
  const [category, setCategory] = useState<string>(badge?.category ?? "learning");
  const [criteriaType, setCriteriaType] = useState<string>(badge?.criteria.type ?? "lessons_completed");
  const [threshold, setThreshold] = useState(String(badge?.criteria.threshold ?? ""));
  const [vmReward, setVmReward] = useState(String(badge?.vmReward ?? ""));
  const [iconKey, setIconKey] = useState(badge?.iconKey ?? "");

  // One form serves both create and edit (unlike Worlds/Mentors' separate
  // New*Form) - the "pristine" baseline is the loaded badge's fields, or
  // this form's own empty defaults when creating. Moves forward after a
  // successful save, same reasoning as Worlds' WorldForm.
  const [savedSnapshot, setSavedSnapshot] = useState(
    badge
      ? {
          name: badge.name,
          description: badge.description,
          category: badge.category as string,
          criteriaType: badge.criteria.type,
          threshold: String(badge.criteria.threshold),
          vmReward: String(badge.vmReward),
          iconKey: badge.iconKey ?? "",
        }
      : {
          name: EMPTY_LOCALIZED,
          description: EMPTY_LOCALIZED,
          category: "learning",
          criteriaType: "lessons_completed",
          threshold: "",
          vmReward: "",
          iconKey: "",
        },
  );

  const dirty =
    LANGUAGES.some((l) => name[l] !== savedSnapshot.name[l]) ||
    LANGUAGES.some((l) => description[l] !== savedSnapshot.description[l]) ||
    category !== savedSnapshot.category ||
    criteriaType !== savedSnapshot.criteriaType ||
    threshold !== savedSnapshot.threshold ||
    vmReward !== savedSnapshot.vmReward ||
    iconKey !== savedSnapshot.iconKey;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const isDraft = !badge || badge.status === "draft";
  const editable = canManage && isDraft;

  const [confirmOpen, setConfirmOpen] = useState(false);

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

  // Task 7: review-before-save only applies to editing an EXISTING badge -
  // creating a brand-new one has no "old" value worth confirming against
  // (every field starts blank), so that path saves directly, same as
  // before this task.
  const changedFields: ChangedFieldInput[] = [
    { label: "Category", oldValue: savedSnapshot.category, newValue: category },
    { label: "Icon key", oldValue: savedSnapshot.iconKey || null, newValue: iconKey || null },
    { label: "Criteria type", oldValue: savedSnapshot.criteriaType, newValue: criteriaType },
    { label: "Threshold", oldValue: Number(savedSnapshot.threshold) || 0, newValue: Number(threshold) || 0 },
    { label: "V Money reward", oldValue: Number(savedSnapshot.vmReward) || 0, newValue: Number(vmReward) || 0, kind: "vmoney" },
    { label: "Name (en)", oldValue: savedSnapshot.name.en, newValue: name.en },
    { label: "Name (hi)", oldValue: savedSnapshot.name.hi, newValue: name.hi },
    { label: "Name (hx)", oldValue: savedSnapshot.name.hx, newValue: name.hx },
    { label: "Description (en)", oldValue: savedSnapshot.description.en, newValue: description.en },
    { label: "Description (hi)", oldValue: savedSnapshot.description.hi, newValue: description.hi },
    { label: "Description (hx)", oldValue: savedSnapshot.description.hx, newValue: description.hx },
  ];

  function doSave() {
    startTransition(async () => {
      const result = badge
        ? await updateBadgeDraftAction({ id: badge.id, ...payload() })
        : await createBadgeDraftAction(payload());
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(badge ? "Draft saved" : "Badge created as a draft");
      setSavedSnapshot({ name, description, category, criteriaType, threshold, vmReward, iconKey });
    });
  }

  function save() {
    if (badge) {
      setConfirmOpen(true);
      return;
    }
    doSave();
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

  function uploadIcon(file: File) {
    if (!badge) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.append("id", badge.id);
      formData.append("file", file);
      const result = await uploadBadgeIconAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Icon uploaded");
    });
  }

  return (
    <div className={cn(GLASS_PANEL, "space-y-4 p-4")}>
      {badge && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <StatusBadge status={badge.status}>{badge.status}</StatusBadge>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        {badge && (
          <div className="col-span-2 space-y-1">
            <Label>Icon image (optional, app ask A10)</Label>
            {badge.iconUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset
              <img src={badge.iconUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
            )}
            {canManage && (
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadIcon(file);
                }}
              />
            )}
          </div>
        )}
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

      {badge && (
        <ConfirmChangesDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Save changes to "${badge.name.en || badge.id}"?`}
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
