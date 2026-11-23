"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MessageSquareText } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  FormProvider,
  useForm,
  useFormContext,
  type FieldPath,
} from "react-hook-form";
import { toast } from "sonner";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { LocalizedText } from "@/server/shared/schemas";
import { CreateCoachNoteTemplateSchema, UpdateCoachNoteTemplateSchema } from "@/server/report-card/schemas";
import {
  createCoachNoteTemplateAction,
  publishCoachNoteTemplateAction,
  unpublishCoachNoteTemplateAction,
  updateCoachNoteTemplateAction,
} from "./actions";
import { CoachNotesTable } from "./coach-notes-table";

type TemplateCategory = "strength" | "gap" | "opportunity" | "habit";

type TemplateRow = {
  id: string;
  category: TemplateCategory;
  template: LocalizedText;
  status: "draft" | "published";
};

const LANGUAGES = ["en", "hi", "hx"] as const;
const WARNABLE_LANGUAGES = ["hi", "hx"] as const; // en is required by the base schema already
const EMPTY_LOCALIZED: LocalizedText = { en: "", hi: "", hx: "" };
const CATEGORIES: TemplateCategory[] = ["strength", "gap", "opportunity", "habit"];

const PLACEHOLDER_HINTS: Record<TemplateCategory, string> = {
  strength: 'Placeholders: {{metric}} (e.g. "quiz accuracy"), {{pct}} (0-100).',
  gap: 'Placeholders: {{metric}} (e.g. "pacing through videos"), {{pct}} (0-100).',
  opportunity: "Placeholders: {{topic}}, {{pct}} (0-100) - this topic's lifetime accuracy.",
  habit: "Placeholders: {{detail}} - a full, already-worded phrase (e.g. a best-weekday or streak note).",
};

// ---------------------------------------------------------------------------
// Non-blocking warnings: empty hi/hx in the template text - previews what
// validateTemplateForPublish (src/server/report-card/service.ts) will
// actually enforce at publish time. Never blocks handleSubmit/draft save.
// ---------------------------------------------------------------------------

type Warning = { path: string; message: string };

function computeTemplateWarnings(template: LocalizedText): Warning[] {
  return WARNABLE_LANGUAGES.filter((lang) => !template[lang]?.trim()).map((lang) => ({
    path: `template.${lang}`,
    message: `Template (${lang}) is empty - required before publish.`,
  }));
}

function findWarning(warnings: Warning[], path: string): string | undefined {
  return warnings.find((w) => w.path === path)?.message;
}

// Maps validateTemplateForPublish's one message shape ("Cannot publish:
// missing template.en, template.hi") onto RHF field paths - everything
// else (NOT_FOUND, "Template is not a draft") falls through to the
// summary box untouched.
function parseTemplateError(message: string): { fieldErrors: Warning[]; summary: string[] } {
  const match = message.match(/^Cannot publish: missing (.+)$/);
  if (match) {
    const fieldErrors = match[1]!.split(",").map((rawPath) => ({
      path: rawPath.trim(),
      message: "Missing translation - required before publish.",
    }));
    return { fieldErrors, summary: [] };
  }
  return { fieldErrors: [], summary: [message] };
}

// ---------------------------------------------------------------------------
// Shared section building blocks
// ---------------------------------------------------------------------------

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h3 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{title}</h3>
      {children}
    </div>
  );
}

function LocalizedFieldGroup({
  label,
  name,
  disabled,
  warnings,
}: {
  label: string;
  name: string;
  disabled: boolean;
  warnings: Warning[];
}) {
  const { register } = useFormContext();
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {LANGUAGES.map((lang) => {
          const path = `${name}.${lang}`;
          const warning = findWarning(warnings, path);
          return (
            <div key={lang} className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase">{lang}</label>
              <Textarea {...register(path)} disabled={disabled} className="min-h-24" />
              {warning && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 text-xs text-amber-700 dark:text-amber-400">
                  {warning}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StoredJsonPanel({ data }: { data: unknown }) {
  return (
    <details className="rounded-lg border border-border bg-card">
      <summary className="cursor-pointer select-none px-4 py-3 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        Advanced: view stored JSON
      </summary>
      <pre className="overflow-x-auto border-t border-border bg-muted/30 p-4 text-xs text-foreground">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}

export function CoachNoteEditor({
  templates,
  canCreate,
  canEdit,
  canDelete,
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
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
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

  // Unsaved-changes guard, part 1: browser tab-close/reload/navigate-away.
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Unsaved-changes guard, part 2: intercepts a click on any same-page link
  // while dirty - same approach as lessons/questions/mentors/worlds.
  useEffect(() => {
    if (!isDirty) return;
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement)?.closest?.("a");
      if (!anchor || !(anchor instanceof HTMLAnchorElement) || !anchor.href) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.origin);
      } catch {
        return;
      }
      if (url.pathname !== window.location.pathname) return;
      if (!window.confirm("Discard unsaved changes to this template?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isDirty]);

  if (total === 0 && !canCreate) {
    return (
      <EmptyState
        icon={MessageSquareText}
        title="No coach note templates yet"
        description="A staff member with coach_note.create can create the first one."
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
        {canCreate && (
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

      {effectiveId === "new" && canCreate ? (
        <NewTemplateForm onDirtyChange={setIsDirty} />
      ) : (
        (() => {
          const template = templates.find((t) => t.id === effectiveId);
          if (!template) return null;
          return (
            <TemplateForm
              key={template.id}
              template={template}
              canEdit={canEdit}
              canDelete={canDelete}
              onDirtyChange={setIsDirty}
            />
          );
        })()
      )}
    </div>
  );
}

type NewTemplateFormValues = { category: TemplateCategory; template: LocalizedText };

function NewTemplateForm({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const [isPending, startTransition] = useTransition();
  const methods = useForm<NewTemplateFormValues>({
    resolver: zodResolver(CreateCoachNoteTemplateSchema),
    defaultValues: { category: "strength", template: EMPTY_LOCALIZED },
  });
  const { handleSubmit, watch, setValue, reset, formState } = methods;

  useEffect(() => {
    onDirtyChange(formState.isDirty);
  }, [formState.isDirty, onDirtyChange]);

  const [category, template] = watch(["category", "template"]);
  const warnings = useMemo(() => computeTemplateWarnings(template), [template]);

  function onSubmit(values: NewTemplateFormValues) {
    startTransition(async () => {
      const result = await createCoachNoteTemplateAction(values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Template created as a draft");
      reset({ category: "strength", template: EMPTY_LOCALIZED });
    });
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pb-20">
        <SectionCard title="Basics">
          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setValue("category", v as TemplateCategory, { shouldValidate: true })}>
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
            <p className="text-xs text-muted-foreground">{PLACEHOLDER_HINTS[category]}</p>
          </div>
          <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
            Encouraging and age-appropriate only - never shaming, never pressuring, never
            comparative (docs/ARCHITECTURE.md D34).
          </p>
        </SectionCard>

        <SectionCard title="Text">
          <LocalizedFieldGroup label="Template" name="template" disabled={false} warnings={warnings} />
        </SectionCard>

        <div className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-border bg-card p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating..." : "Create draft"}
          </Button>
          <Button type="button" variant="outline" onClick={() => reset()} disabled={isPending}>
            Cancel
          </Button>
          {formState.isDirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        </div>
      </form>
    </FormProvider>
  );
}

type TemplateFormValues = { category: TemplateCategory; template: LocalizedText };

function TemplateForm({
  template,
  canEdit,
  canDelete,
  onDirtyChange,
}: {
  template: TemplateRow;
  canEdit: boolean;
  canDelete: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [errorSummary, setErrorSummary] = useState<string[]>([]);

  // No separate hotfix tier exists for coach notes (no
  // HotfixCoachNoteTemplateSchema/action) - updateCoachNoteTemplateAction
  // only requires coach_note.edit, and this editor keeps the existing
  // behavior of only allowing edits while still a draft (editable), never
  // on a published template, matching the ORIGINAL editor's gating exactly
  // even though the server itself doesn't separately enforce that.
  const isDraft = template.status === "draft";
  const editable = canEdit && isDraft;

  const methods = useForm<TemplateFormValues>({
    resolver: zodResolver(UpdateCoachNoteTemplateSchema.omit({ id: true })),
    defaultValues: { category: template.category, template: template.template },
  });
  const { handleSubmit, watch, setValue, reset, setError, clearErrors, formState } = methods;

  useEffect(() => {
    onDirtyChange(formState.isDirty);
  }, [formState.isDirty, onDirtyChange]);

  const [category, text] = watch(["category", "template"]);
  const warnings = useMemo(() => computeTemplateWarnings(text), [text]);

  function applyServerError(message: string) {
    clearErrors();
    const { fieldErrors, summary } = parseTemplateError(message);
    fieldErrors.forEach(({ path, message: fieldMessage }) =>
      setError(path as FieldPath<TemplateFormValues>, { type: "server", message: fieldMessage }),
    );
    setErrorSummary(summary.length > 0 ? summary : fieldErrors.length === 0 ? [message] : []);
  }

  function onSave(values: TemplateFormValues) {
    setErrorSummary([]);
    startTransition(async () => {
      const result = await updateCoachNoteTemplateAction({ id: template.id, ...values });
      if (!result.ok) {
        applyServerError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Draft saved");
      reset(values);
    });
  }

  function publish() {
    setErrorSummary([]);
    clearErrors();
    startTransition(async () => {
      const result = await publishCoachNoteTemplateAction({ id: template.id });
      if (!result.ok) {
        applyServerError(result.error);
        toast.error("Can't publish yet - see the errors below.");
        return;
      }
      toast.success("Published");
    });
  }

  function unpublish() {
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
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSave)} className="space-y-4 pb-20">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <StatusBadge status={template.status}>{template.status}</StatusBadge>
          {!isDraft && (
            <span className="text-xs text-muted-foreground">
              Published - unpublish to edit (no direct-fix path exists for coach notes).
            </span>
          )}
        </div>

        {errorSummary.length > 0 && (
          <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <p className="font-medium">Can&apos;t save/publish:</p>
            <ul className="ml-4 list-disc">
              {errorSummary.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        <SectionCard title="Basics">
          <div className="space-y-1">
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setValue("category", v as TemplateCategory, { shouldValidate: true })}
              disabled={!editable}
            >
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
            <p className="text-xs text-muted-foreground">{PLACEHOLDER_HINTS[category]}</p>
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <div>
              <StatusBadge status={template.status}>{template.status}</StatusBadge>
            </div>
          </div>
          <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
            Encouraging and age-appropriate only - never shaming, never pressuring, never
            comparative (docs/ARCHITECTURE.md D34).
          </p>
        </SectionCard>

        <SectionCard title="Text">
          <LocalizedFieldGroup label="Template" name="template" disabled={!editable} warnings={warnings} />
        </SectionCard>

        <StoredJsonPanel data={{ id: template.id, category: template.category, status: template.status, template: template.template }} />

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-border bg-card p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          {editable && (
            <Button type="submit" variant="outline" disabled={isPending}>
              Save draft
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => reset()} disabled={isPending}>
            Cancel
          </Button>
          {canDelete && isDraft && (
            <Button type="button" onClick={publish} disabled={isPending}>
              Publish
            </Button>
          )}
          {canDelete && !isDraft && (
            <Button type="button" variant="outline" onClick={unpublish} disabled={isPending}>
              Unpublish
            </Button>
          )}
          {formState.isDirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        </div>
      </form>
    </FormProvider>
  );
}
