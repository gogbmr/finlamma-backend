"use client";

import { MessageSquareText } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { LocalizedText } from "@/server/shared/schemas";
import {
  createCoachNoteTemplateAction,
  publishCoachNoteTemplateAction,
  unpublishCoachNoteTemplateAction,
  updateCoachNoteTemplateAction,
} from "./actions";
import { CoachNotesTable } from "./coach-notes-table";

type TemplateRow = {
  id: string;
  category: "strength" | "gap" | "opportunity" | "habit";
  template: LocalizedText;
  status: "draft" | "published";
};

const LANGUAGES = ["en", "hi", "hx"] as const;
const EMPTY_LOCALIZED: LocalizedText = { en: "", hi: "", hx: "" };
const CATEGORIES = ["strength", "gap", "opportunity", "habit"] as const;

const PLACEHOLDER_HINTS: Record<TemplateRow["category"], string> = {
  strength: "Placeholders: {{metric}} (e.g. \"quiz accuracy\"), {{pct}} (0-100).",
  gap: "Placeholders: {{metric}} (e.g. \"pacing through videos\"), {{pct}} (0-100).",
  opportunity: "Placeholders: {{topic}}, {{pct}} (0-100) - this topic's lifetime accuracy.",
  habit: "Placeholders: {{detail}} - a full, already-worded phrase (e.g. a best-weekday or streak note).",
};

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

export function CoachNoteEditor({
  templates,
  canManage,
  canPublish,
  total,
  page,
  pageCount,
  pageSize,
  q,
  sort,
  dir,
  status,
}: {
  templates: TemplateRow[];
  canManage: boolean;
  canPublish: boolean;
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  q: string;
  sort: string | null;
  dir: "asc" | "desc";
  status: "draft" | "published" | null;
}) {
  const [selectedId, setSelectedId] = useState<string | "new" | null>(templates[0]?.id ?? "new");
  // Few-line confirm() guard, same pattern as the other small catalogs -
  // doesn't cover Prev/Next/search/sort/status, deferred to Task 4.
  const [isDirty, setIsDirty] = useState(false);

  function trySelect(id: string | "new") {
    if (
      isDirty &&
      typeof window !== "undefined" &&
      !window.confirm("Discard unsaved changes to this template?")
    ) {
      return;
    }
    setIsDirty(false);
    setSelectedId(id);
  }

  if (total === 0 && !canManage) {
    return (
      <EmptyState
        icon={MessageSquareText}
        title="No coach note templates yet"
        description="A staff member with coach_note.manage can create the first one."
      />
    );
  }

  const effectiveId: string | "new" =
    selectedId === "new" || templates.some((t) => t.id === selectedId)
      ? (selectedId as string | "new")
      : templates[0]?.id ?? "new";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Select a template below to edit it.</p>
        {canManage && (
          <Button type="button" size="sm" onClick={() => trySelect("new")}>
            + New template
          </Button>
        )}
      </div>

      <CoachNotesTable
        rows={templates.map((t) => ({ id: t.id, category: t.category, template: t.template, status: t.status }))}
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
        <TemplateForm canManage={canManage} canPublish={canPublish} onDirtyChange={setIsDirty} />
      ) : (
        (() => {
          const template = templates.find((t) => t.id === effectiveId);
          if (!template) return null;
          return (
            <TemplateForm
              key={template.id}
              template={template}
              canManage={canManage}
              canPublish={canPublish}
              onDirtyChange={setIsDirty}
            />
          );
        })()
      )}
    </div>
  );
}

function TemplateForm({
  template,
  canManage,
  canPublish,
  onDirtyChange,
}: {
  template?: TemplateRow;
  canManage: boolean;
  canPublish: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [category, setCategory] = useState<string>(template?.category ?? "strength");
  const [text, setText] = useState<LocalizedText>(template?.template ?? EMPTY_LOCALIZED);

  // One form serves both create and edit - same reasoning as Badges'
  // BadgeForm: the baseline is the loaded template's fields, or this
  // form's own empty defaults when creating, moving forward after save.
  const [savedSnapshot, setSavedSnapshot] = useState(
    template
      ? { category: template.category as string, text: template.template }
      : { category: "strength", text: EMPTY_LOCALIZED },
  );

  const dirty =
    category !== savedSnapshot.category || LANGUAGES.some((l) => text[l] !== savedSnapshot.text[l]);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const isDraft = !template || template.status === "draft";
  const editable = canManage && isDraft;

  function payload() {
    return { category: category as TemplateRow["category"], template: text };
  }

  function save() {
    startTransition(async () => {
      const result = template
        ? await updateCoachNoteTemplateAction({ id: template.id, ...payload() })
        : await createCoachNoteTemplateAction(payload());
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(template ? "Draft saved" : "Template created as a draft");
      setSavedSnapshot({ category, text });
    });
  }

  function publish() {
    if (!template) return;
    startTransition(async () => {
      const result = await publishCoachNoteTemplateAction({ id: template.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Published");
    });
  }

  function unpublish() {
    if (!template) return;
    startTransition(async () => {
      const result = await unpublishCoachNoteTemplateAction({ id: template.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Unpublished - back to draft");
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      {template && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <StatusBadge status={template.status}>{template.status}</StatusBadge>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">Category</label>
        <Select value={category} onValueChange={setCategory} disabled={!editable}>
          <SelectTrigger className="w-56">
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

      <p className="text-xs text-muted-foreground">{PLACEHOLDER_HINTS[category as TemplateRow["category"]]}</p>
      <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
        Encouraging and age-appropriate only - never shaming, never pressuring, never comparative
        (docs/ARCHITECTURE.md D34).
      </p>

      <LocalizedFields label="Template" value={text} onChange={setText} disabled={!editable} />

      <div className="flex gap-2">
        {editable && (
          <Button type="button" onClick={save} disabled={isPending}>
            {template ? "Save draft" : "Create draft"}
          </Button>
        )}
        {canPublish && template && isDraft && (
          <Button type="button" variant="outline" onClick={publish} disabled={isPending}>
            Publish
          </Button>
        )}
        {canPublish && template && !isDraft && (
          <Button type="button" variant="outline" onClick={unpublish} disabled={isPending}>
            Unpublish
          </Button>
        )}
      </div>
    </div>
  );
}
