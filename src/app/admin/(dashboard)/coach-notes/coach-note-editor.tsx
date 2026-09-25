"use client";

import { MessageSquareText } from "lucide-react";
import { useState, useTransition } from "react";
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
}: {
  templates: TemplateRow[];
  canManage: boolean;
  canPublish: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | "new" | null>(templates[0]?.id ?? "new");

  if (templates.length === 0 && !canManage) {
    return (
      <EmptyState
        icon={MessageSquareText}
        title="No coach note templates yet"
        description="A staff member with coach_note.manage can create the first one."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Select value={selectedId ?? "new"} onValueChange={setSelectedId}>
        <SelectTrigger className="w-96">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {templates.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.category} - {t.template.en || "(untitled)"} ({t.status})
            </SelectItem>
          ))}
          {canManage && <SelectItem value="new">+ New template</SelectItem>}
        </SelectContent>
      </Select>

      {selectedId === "new" && canManage ? (
        <TemplateForm canManage={canManage} canPublish={canPublish} />
      ) : (
        (() => {
          const template = templates.find((t) => t.id === selectedId);
          if (!template) return null;
          return <TemplateForm key={template.id} template={template} canManage={canManage} canPublish={canPublish} />;
        })()
      )}
    </div>
  );
}

function TemplateForm({
  template,
  canManage,
  canPublish,
}: {
  template?: TemplateRow;
  canManage: boolean;
  canPublish: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [category, setCategory] = useState<string>(template?.category ?? "strength");
  const [text, setText] = useState<LocalizedText>(template?.template ?? EMPTY_LOCALIZED);

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
