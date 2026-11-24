"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BookOpen, Film, HelpCircle, Info, MessageSquareText, Plus, Trash2, Type } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ComponentType } from "react";
import {
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  type FieldPath,
  type Resolver,
} from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { GLASS_PANEL, GLASS_PANEL_SUBTLE, GlassIconChip } from "@/components/admin/glass";
import type { LocalizedText } from "@/server/shared/schemas";
import { LESSON_CONTENT_TEMPLATES, type LessonKindCreate } from "@/server/lessons/schemas";
import {
  createLessonDraftAction,
  hotfixLessonAction,
  previewLessonAction,
  publishLessonAction,
  unpublishLessonAction,
  updateLessonDraftAction,
} from "./actions";
import {
  buildLessonFormSchema,
  contentToFormValues,
  CREATABLE_KINDS,
  extractUnknownContentKeys,
  formValuesToContent,
  type CreatableKind,
} from "./lesson-content";
import { LessonPreview } from "./lesson-preview";

type PreviewData = Extract<Awaited<ReturnType<typeof previewLessonAction>>, { ok: true }>["data"];

const KIND_LABELS: Record<string, string> = {
  video: "Video",
  story: "Story",
  quiz: "Quiz",
  boss_quiz: "Boss Quiz",
  role_play: "Role Play",
  doubt_zone: "Doubt Zone",
};

export type LessonRow = {
  id: string;
  worldId: string;
  chapter: number;
  step: number;
  kind: string;
  title: LocalizedText;
  blurb: LocalizedText;
  content: unknown;
  status: "draft" | "published";
  inProgressLearnerCount: number;
};

const LANGUAGES = ["en", "hi", "hx"] as const;
const WARNABLE_LANGUAGES = ["hi", "hx"] as const; // en is required by the base schema already
const EMPTY_LOCALIZED: LocalizedText = { en: "", hi: "", hx: "" };

type LessonFormValues = {
  chapter: number;
  step: number;
  title: LocalizedText;
  blurb: LocalizedText;
  // Loosely typed, same reasoning src/server/lessons/schemas.ts's own
  // CreateLessonDraftSchema has for its `content` field (z.record(string,
  // unknown())) - the real shape is one of 4 kind-specific schemas above,
  // dispatched at runtime by the section components below, not something
  // a single static TS type usefully discriminates here without far more
  // machinery than this form needs.
  content: Record<string, unknown>;
};

// Wraps zodResolver so the schema used for validation always matches the
// LIVE kind, without remounting the whole form when kind changes (which
// would reset title/blurb too - existing behavior that stays unchanged).
// Standard RHF pattern for "resolver depends on another field's value".
function useDynamicLessonResolver(kindRef: { current: LessonKindCreate }): Resolver<LessonFormValues> {
  return useMemo(() => {
    // The schema's inferred content shape is narrower per-kind than
    // LessonFormValues's loose `Record<string, unknown>` (see the comment
    // on that type above) - that's the whole point of switching schemas by
    // kind, so bridging through `any` here is intentional, not a type
    // hole: zodResolver still runs the real per-kind validation at
    // runtime, against whichever schema buildLessonFormSchema picks.
    const dynamicResolver = async (values: unknown, context: unknown, options: unknown) => {
      const schema = buildLessonFormSchema(kindRef.current);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return zodResolver(schema)(values as any, context as any, options as any);
    };
    return dynamicResolver as unknown as Resolver<LessonFormValues>;
    // kindRef is a stable ref object - the resolver always reads its
    // CURRENT .current, so it never needs to be recreated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ---------------------------------------------------------------------------
// Non-blocking warnings (Task 4): empty hi/hx, a non-https video URL, a
// cue's position (at) beyond lengthSeconds or out of order, empty scenes.
// Computed separately from the zodResolver schema above - these never
// block handleSubmit/draft save, only render as inline notices next to the
// field they're about, previewing what Task 4b's validateLessonForPublish
// (src/server/lessons/service.ts) will actually enforce at publish time:
// https-only video URLs (Rule A) and cue position/ordering (Rule B's
// position half - Rule B's timerSeconds > 0 half is already a BLOCKING
// Zod error here, via VideoCueSchema's own `.positive()`, so it never needs
// a warning of its own).
// ---------------------------------------------------------------------------

type Warning = { path: string; message: string };

function warnIfEmpty(value: LocalizedText | undefined, pathPrefix: string, label: string): Warning[] {
  if (!value) return [];
  return WARNABLE_LANGUAGES.filter((lang) => !value[lang]?.trim()).map((lang) => ({
    path: `${pathPrefix}.${lang}`,
    message: `${label} (${lang}) is empty - required before publish.`,
  }));
}

function computeLessonWarnings(
  kind: string,
  title: LocalizedText,
  blurb: LocalizedText,
  content: Record<string, unknown>,
): Warning[] {
  const warnings: Warning[] = [
    ...warnIfEmpty(title, "title", "Title"),
    ...warnIfEmpty(blurb, "blurb", "Blurb"),
  ];

  if (kind === "video") {
    const url = (content.video as { url?: Record<string, string | null> } | undefined)?.url;
    if (url) {
      for (const lang of LANGUAGES) {
        const value = url[lang];
        if (value && !/^https:\/\//i.test(value)) {
          warnings.push({
            path: `content.video.url.${lang}`,
            message: `URL (${lang}) doesn't start with https:// - most players/webviews will refuse a plain http:// source, and publish will block on this.`,
          });
        }
      }
    }
    const scenes = Array.isArray(content.scenes) ? content.scenes : [];
    if (scenes.length === 0) {
      warnings.push({ path: "content.scenes", message: "No scenes added yet." });
    }
    scenes.forEach((scene: Record<string, unknown>, i: number) => {
      warnings.push(...warnIfEmpty(scene.title as LocalizedText, `content.scenes.${i}.title`, `Scene ${i + 1} title`));
      warnings.push(
        ...warnIfEmpty(scene.caption as LocalizedText, `content.scenes.${i}.caption`, `Scene ${i + 1} caption`),
      );
      warnings.push(
        ...warnIfEmpty(
          scene.mascotLine as LocalizedText,
          `content.scenes.${i}.mascotLine`,
          `Scene ${i + 1} mascot line`,
        ),
      );
    });
    // Mirrors validateVideoCueTiming's two position-based checks exactly
    // (src/server/lessons/service.ts) - at (not timerSeconds) is the cue's
    // position in the video; timerSeconds is the learner's answer
    // countdown, a separate field the length check was never about.
    const cues = Array.isArray(content.cues) ? content.cues : [];
    const lengthSecondsRaw = content.lengthSeconds;
    const lengthSeconds = typeof lengthSecondsRaw === "number" ? lengthSecondsRaw : null;
    let previousAt: number | null = null;
    cues.forEach((cue: Record<string, unknown>, i: number) => {
      const at = typeof cue.at === "number" ? cue.at : null;
      if (at !== null && lengthSeconds !== null && at > lengthSeconds) {
        warnings.push({
          path: `content.cues.${i}.at`,
          message: `Cue ${i + 1} fires at ${at}s, after the video ends (${lengthSeconds}s).`,
        });
      }
      if (at !== null && previousAt !== null && at < previousAt) {
        warnings.push({
          path: `content.cues.${i}.at`,
          message: `Cue ${i + 1} fires at ${at}s, before the previous cue - cues must be in order.`,
        });
      }
      if (at !== null) previousAt = at;
    });
  }

  if (kind === "story") {
    const pages = Array.isArray(content.pages) ? content.pages : [];
    pages.forEach((page: Record<string, unknown>, i: number) => {
      warnings.push(...warnIfEmpty(page.text as LocalizedText, `content.pages.${i}.text`, `Page ${i + 1} text`));
    });
  }

  if (kind === "quiz" || kind === "boss_quiz" || kind === "role_play") {
    const framing = content.framing as LocalizedText | undefined;
    if (framing) warnings.push(...warnIfEmpty(framing, "content.framing", "Framing"));
  }

  if (kind === "doubt_zone") {
    warnings.push(
      ...warnIfEmpty(
        content.educationalOnlyNote as LocalizedText,
        "content.educationalOnlyNote",
        "Educational note",
      ),
    );
    const chips = Array.isArray(content.chips) ? content.chips : [];
    chips.forEach((chip: Record<string, unknown>, i: number) => {
      warnings.push(
        ...warnIfEmpty(chip.chipLabel as LocalizedText, `content.chips.${i}.chipLabel`, `Chip ${i + 1} label`),
      );
      warnings.push(...warnIfEmpty(chip.reply as LocalizedText, `content.chips.${i}.reply`, `Chip ${i + 1} reply`));
    });
  }

  return warnings;
}

function findWarning(warnings: Warning[], path: string): string | undefined {
  return warnings.find((w) => w.path === path)?.message;
}

// Turns the server's unchanged, flat publish-error message ("Cannot
// publish: missing translation for title.hi; missing translation for
// content.scenes[0].title.hi; content.cues[0].at (5s) is after the video
// ends (4s)") into per-field RHF errors where a leading field path can be
// recognized, and a plain-English summary list for anything else (e.g. a
// question-reference problem, which names a question id, not a form
// field). Deliberately just string-parsing of the EXISTING message - the
// server's AppError.details already carries this as structured data
// (src/server/lessons/service.ts's validateLessonForPublish), but
// publishLessonAction (unchanged, per this task) only ever returns
// `err.message`, never `err.details`, so that's the only thing available
// here without touching the action.
function parsePublishError(message: string): { fieldErrors: Warning[]; summary: string[] } {
  const prefix = "Cannot publish: ";
  const body = message.startsWith(prefix) ? message.slice(prefix.length) : message;
  const parts = body
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);

  const fieldErrors: Warning[] = [];
  const summary: string[] = [];

  for (const part of parts) {
    const missingMatch = part.match(/^missing translation for (\S+)$/);
    if (missingMatch) {
      const rhfPath = missingMatch[1]!.replace(/\[(\d+)\]/g, ".$1");
      fieldErrors.push({ path: rhfPath, message: "Missing translation - required before publish." });
      continue;
    }
    // Matches both "content.cues[0].at (5s) is after..." (space) and
    // service.ts's "content.lengthSeconds: Required" (colon) error shapes -
    // validateVideoContentShape (the latter) reuses updateLessonDraft/
    // hotfixLesson's own "content.path: message" convention.
    const pathMatch = part.match(/^(content\.[\w.[\]]+)[\s:]/);
    if (pathMatch) {
      const rhfPath = pathMatch[1]!.replace(/\[(\d+)\]/g, ".$1");
      fieldErrors.push({ path: rhfPath, message: part });
      continue;
    }
    summary.push(part);
  }

  return { fieldErrors, summary };
}

// Unsaved-changes guard for a lesson form living on its own page (create/
// edit) - part 1: browser tab-close/reload/navigate-away, part 2:
// intercepts a click on any same-page link while dirty. Same approach as
// worlds/mentors/questions; previously lived once in the now-removed
// LessonEditor wrapper (when create/edit were both inline on the list
// page), now each standalone form owns its own guard directly.
function useUnsavedChangesGuard(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

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
      if (!window.confirm("Discard unsaved changes to this lesson?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isDirty]);
}

// ---------------------------------------------------------------------------
// Shared section building blocks
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(GLASS_PANEL, "space-y-3 p-5")}>
      <h3 className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        {Icon && <GlassIconChip icon={Icon} className="h-6 w-6 rounded-md" />}
        {title}
      </h3>
      {children}
    </div>
  );
}

// Read-only escape hatch for staff who want to see exactly what's in the
// database right now - e.g. to confirm this round-trip (and its
// unknown-key passthrough above) really did preserve everything, without
// leaving the admin UI. Collapsed by default (native <details>, no new
// package); shows the lesson exactly as loaded, never the live-edited
// form state, so it stays a trustworthy "what's stored" reference even
// while the form above it is mid-edit.
function StoredJsonPanel({ data }: { data: unknown }) {
  return (
    <details className={GLASS_PANEL}>
      <summary className="cursor-pointer select-none px-4 py-3 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        Advanced: view stored JSON
      </summary>
      <pre className="overflow-x-auto border-t border-white/50 p-4 text-xs text-foreground">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}

// en/hi/hx grouped SIDE BY SIDE for one field (Task 4), each column
// clearly labelled - replaces the old stacked-rows layout. `name` is the
// RHF field path prefix (e.g. "title", or "content.scenes.0.title").
function LocalizedFieldGroup({
  label,
  name,
  disabled,
  warnings,
  multiline = true,
}: {
  label: string;
  name: string;
  disabled: boolean;
  warnings: Warning[];
  multiline?: boolean;
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
              {multiline ? (
                <Textarea {...register(path as FieldPath<LessonFormValues>)} disabled={disabled} className="min-h-20" />
              ) : (
                <Input {...register(path as FieldPath<LessonFormValues>)} disabled={disabled} />
              )}
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

function BasicsSection({
  worldTitle,
  kind,
  kindEditable,
  onKindChange,
  status,
  editable,
}: {
  worldTitle: LocalizedText;
  kind: CreatableKind;
  kindEditable: boolean;
  onKindChange?: (kind: CreatableKind) => void;
  status: "draft" | "published" | null;
  editable: boolean;
}) {
  const { register } = useFormContext<LessonFormValues>();
  return (
    <SectionCard title="Basics" icon={Info}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label>World</Label>
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
            {worldTitle.en || "(untitled)"}
          </p>
        </div>
        <div className="space-y-1">
          <Label>Kind</Label>
          {kindEditable ? (
            <Select value={kind} onValueChange={(v) => onKindChange?.(v as CreatableKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CREATABLE_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
              {KIND_LABELS[kind] ?? kind} <span className="text-muted-foreground">(fixed)</span>
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label>Chapter (1-8)</Label>
          <Input type="number" min={1} max={8} disabled={!editable} {...register("chapter", { valueAsNumber: true })} />
        </div>
        <div className="space-y-1">
          <Label>Step (1-5)</Label>
          <Input type="number" min={1} max={5} disabled={!editable} {...register("step", { valueAsNumber: true })} />
        </div>
      </div>
      {status && (
        <div className="flex items-center gap-2">
          <Label>Status</Label>
          <StatusBadge status={status}>{status}</StatusBadge>
        </div>
      )}
    </SectionCard>
  );
}

function TextSection({ disabled, warnings }: { disabled: boolean; warnings: Warning[] }) {
  return (
    <SectionCard title="Text" icon={Type}>
      <LocalizedFieldGroup label="Title" name="title" disabled={disabled} warnings={warnings} />
      <LocalizedFieldGroup label="Blurb" name="blurb" disabled={disabled} warnings={warnings} />
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Content sections, one per kind - Task 4
// ---------------------------------------------------------------------------

function SceneFields({
  index,
  disabled,
  warnings,
  onRemove,
}: {
  index: number;
  disabled: boolean;
  warnings: Warning[];
  onRemove: () => void;
}) {
  const { register } = useFormContext();
  const base = `content.scenes.${index}`;
  return (
    <div className={cn(GLASS_PANEL_SUBTLE, "space-y-3 p-3")}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Scene {index + 1}</p>
        {!disabled && (
          <Button type="button" variant="outline" size="sm" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>At (seconds)</Label>
          <Input type="number" min={0} disabled={disabled} {...register(`${base}.at`, { valueAsNumber: true })} />
        </div>
        <div className="space-y-1">
          <Label>Kind (free text, e.g. &quot;trade&quot;)</Label>
          <Input disabled={disabled} {...register(`${base}.kind`)} />
        </div>
      </div>
      <LocalizedFieldGroup label="Title" name={`${base}.title`} disabled={disabled} warnings={warnings} multiline={false} />
      <LocalizedFieldGroup label="Caption" name={`${base}.caption`} disabled={disabled} warnings={warnings} />
      <LocalizedFieldGroup label="Mascot line" name={`${base}.mascotLine`} disabled={disabled} warnings={warnings} />
    </div>
  );
}

function CueFields({
  index,
  disabled,
  warnings,
  onRemove,
}: {
  index: number;
  disabled: boolean;
  warnings: Warning[];
  onRemove: () => void;
}) {
  const { register } = useFormContext();
  const base = `content.cues.${index}`;
  const warning = findWarning(warnings, `${base}.at`);
  return (
    <div className={cn(GLASS_PANEL_SUBTLE, "space-y-2 p-3")}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Cue {index + 1}</p>
        {!disabled && (
          <Button type="button" variant="outline" size="sm" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </Button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>At (seconds)</Label>
          <Input type="number" min={0} disabled={disabled} {...register(`${base}.at`, { valueAsNumber: true })} />
        </div>
        <div className="space-y-1">
          <Label>Question id</Label>
          <Input disabled={disabled} {...register(`${base}.questionId`)} placeholder="uuid" />
        </div>
        <div className="space-y-1">
          <Label>Timer (seconds)</Label>
          <Input
            type="number"
            min={1}
            disabled={disabled}
            {...register(`${base}.timerSeconds`, { valueAsNumber: true })}
          />
        </div>
      </div>
      {warning && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 text-xs text-amber-700 dark:text-amber-400">
          {warning}
        </p>
      )}
    </div>
  );
}

function VideoContentSection({ disabled, warnings }: { disabled: boolean; warnings: Warning[] }) {
  const { register, control } = useFormContext();
  const scenes = useFieldArray({ control, name: "content.scenes" });
  const cues = useFieldArray({ control, name: "content.cues" });
  const scenesWarning = findWarning(warnings, "content.scenes");

  return (
    <SectionCard title="Content - Video" icon={Film}>
      <div className="space-y-1">
        <Label>Length (seconds)</Label>
        <Input
          type="number"
          min={1}
          disabled={disabled}
          className="w-40"
          {...register("content.lengthSeconds", { valueAsNumber: true })}
        />
      </div>

      <LocalizedFieldGroup label="Video URL" name="content.video.url" disabled={disabled} warnings={warnings} multiline={false} />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Scenes</Label>
          {!disabled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                scenes.append({
                  at: 0,
                  kind: "trade",
                  title: EMPTY_LOCALIZED,
                  caption: EMPTY_LOCALIZED,
                  mascotLine: EMPTY_LOCALIZED,
                })
              }
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> Add scene
            </Button>
          )}
        </div>
        {scenesWarning && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 text-xs text-amber-700 dark:text-amber-400">
            {scenesWarning}
          </p>
        )}
        {scenes.fields.map((field, i) => (
          <SceneFields key={field.id} index={i} disabled={disabled} warnings={warnings} onRemove={() => scenes.remove(i)} />
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Pop-quiz cues</Label>
          {!disabled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => cues.append({ at: 0, questionId: "", timerSeconds: 15 })}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> Add cue
            </Button>
          )}
        </div>
        {cues.fields.map((field, i) => (
          <CueFields key={field.id} index={i} disabled={disabled} warnings={warnings} onRemove={() => cues.remove(i)} />
        ))}
      </div>
    </SectionCard>
  );
}

function StoryContentSection({ disabled, warnings }: { disabled: boolean; warnings: Warning[] }) {
  const { register, control } = useFormContext();
  const pages = useFieldArray({ control, name: "content.pages" });

  return (
    <SectionCard title="Content - Story" icon={BookOpen}>
      <div className="space-y-1">
        <Label>Length (seconds)</Label>
        <Input
          type="number"
          min={1}
          disabled={disabled}
          className="w-40"
          {...register("content.lengthSeconds", { valueAsNumber: true })}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Pages</Label>
          {!disabled && (
            <Button type="button" variant="outline" size="sm" onClick={() => pages.append({ text: EMPTY_LOCALIZED })}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Add page
            </Button>
          )}
        </div>
        {pages.fields.map((field, i) => (
          <div key={field.id} className={cn(GLASS_PANEL_SUBTLE, "space-y-2 p-3")}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Page {i + 1}</p>
              {!disabled && pages.fields.length > 1 && (
                <Button type="button" variant="outline" size="sm" onClick={() => pages.remove(i)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              )}
            </div>
            <LocalizedFieldGroup label="Text" name={`content.pages.${i}.text`} disabled={disabled} warnings={warnings} />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// "The existing question picking, same behaviour" (Task 4) - this app has
// no searchable question browser anywhere; staff have always specified a
// question by pasting its id. This keeps that exact capability, just as an
// add/remove list instead of a raw JSON array - not a new picker UI.
function QuestionIdListField({ disabled }: { disabled: boolean }) {
  const { register, control } = useFormContext();
  const ids = useFieldArray({ control, name: "content.questionIds" });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Question ids, in order</Label>
        {!disabled && (
          <Button type="button" variant="outline" size="sm" onClick={() => ids.append({ value: "" })}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add question
          </Button>
        )}
      </div>
      {ids.fields.map((field, i) => (
        <div key={field.id} className="flex items-center gap-2">
          <span className="w-6 text-xs text-muted-foreground">{i + 1}.</span>
          <Input disabled={disabled} placeholder="uuid" {...register(`content.questionIds.${i}.value`)} />
          {!disabled && (
            <Button type="button" variant="outline" size="sm" onClick={() => ids.remove(i)}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          )}
        </div>
      ))}
      {ids.fields.length === 0 && <p className="text-xs text-muted-foreground">No questions added yet.</p>}
    </div>
  );
}

function QuizLikeContentSection({
  kind,
  kindLabel,
  disabled,
  warnings,
}: {
  kind: "quiz" | "boss_quiz" | "role_play";
  kindLabel: string;
  disabled: boolean;
  warnings: Warning[];
}) {
  return (
    <SectionCard title={`Content - ${kindLabel}`} icon={HelpCircle}>
      <QuestionIdListField disabled={disabled} />
      {/* Framing is Role Play's own dialogue/receipt-graphic text (see
          QuizLikeContentSchema's comment in schemas.ts) - the schema shares
          one shape across quiz/boss_quiz/role_play for reuse, but only Role
          Play actually uses this field today. Rendering it for quiz/
          boss_quiz too would silently write an empty {en:"",hi:"",hx:""}
          framing object onto every quiz/boss_quiz save even though neither
          kind has ever had one - exactly the kind of reformatting Task 4's
          round-trip check exists to catch. */}
      {kind === "role_play" && (
        <LocalizedFieldGroup label="Framing (optional)" name="content.framing" disabled={disabled} warnings={warnings} />
      )}
    </SectionCard>
  );
}

function DoubtZoneContentSection({ disabled, warnings }: { disabled: boolean; warnings: Warning[] }) {
  const { register, control } = useFormContext();
  const chips = useFieldArray({ control, name: "content.chips" });

  return (
    <SectionCard title="Content - Doubt Zone" icon={MessageSquareText}>
      <div className="space-y-1">
        <Label>Mentor key</Label>
        <Input disabled={disabled} className="w-48" {...register("content.mentorKey")} />
      </div>
      <LocalizedFieldGroup
        label="Educational-only note"
        name="content.educationalOnlyNote"
        disabled={disabled}
        warnings={warnings}
      />
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Chips (suggested questions)</Label>
          {!disabled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => chips.append({ chipLabel: EMPTY_LOCALIZED, reply: EMPTY_LOCALIZED })}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> Add chip
            </Button>
          )}
        </div>
        {chips.fields.map((field, i) => (
          <div key={field.id} className={cn(GLASS_PANEL_SUBTLE, "space-y-2 p-3")}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Chip {i + 1}</p>
              {!disabled && chips.fields.length > 1 && (
                <Button type="button" variant="outline" size="sm" onClick={() => chips.remove(i)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              )}
            </div>
            <LocalizedFieldGroup
              label="Chip label"
              name={`content.chips.${i}.chipLabel`}
              disabled={disabled}
              warnings={warnings}
              multiline={false}
            />
            <LocalizedFieldGroup label="Reply" name={`content.chips.${i}.reply`} disabled={disabled} warnings={warnings} />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function ContentSection({ kind, disabled, warnings }: { kind: string; disabled: boolean; warnings: Warning[] }) {
  if (kind === "video") return <VideoContentSection disabled={disabled} warnings={warnings} />;
  if (kind === "story") return <StoryContentSection disabled={disabled} warnings={warnings} />;
  if (kind === "quiz" || kind === "boss_quiz" || kind === "role_play") {
    return (
      <QuizLikeContentSection
        kind={kind}
        kindLabel={KIND_LABELS[kind] ?? kind}
        disabled={disabled}
        warnings={warnings}
      />
    );
  }
  if (kind === "doubt_zone") return <DoubtZoneContentSection disabled={disabled} warnings={warnings} />;
  return null;
}

// ---------------------------------------------------------------------------
// New lesson form
// ---------------------------------------------------------------------------

export function NewLessonForm({
  worldId,
  worldTitle,
}: {
  worldId: string;
  worldTitle: LocalizedText;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [kind, setKind] = useState<CreatableKind>("video");
  const kindRef = useRef<CreatableKind>(kind);
  kindRef.current = kind;
  const resolver = useDynamicLessonResolver(kindRef);

  const methods = useForm<LessonFormValues>({
    resolver,
    defaultValues: {
      chapter: 1,
      step: 1,
      title: EMPTY_LOCALIZED,
      blurb: EMPTY_LOCALIZED,
      content: contentToFormValues("video", LESSON_CONTENT_TEMPLATES.video),
    },
  });
  const { handleSubmit, watch, reset, formState } = methods;

  useUnsavedChangesGuard(formState.isDirty);

  const [title, blurb, content] = watch(["title", "blurb", "content"]);
  const warnings = useMemo(() => computeLessonWarnings(kind, title, blurb, content), [kind, title, blurb, content]);

  function changeKind(newKind: CreatableKind) {
    setKind(newKind);
    reset(
      {
        ...methods.getValues(),
        content: contentToFormValues(newKind, LESSON_CONTENT_TEMPLATES[newKind]),
      },
      { keepDirty: true },
    );
  }

  function onSubmit(values: LessonFormValues) {
    startTransition(async () => {
      const result = await createLessonDraftAction({
        worldId,
        chapter: values.chapter,
        step: values.step,
        kind,
        title: values.title,
        blurb: values.blurb,
        content: formValuesToContent(kind, values.content),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Lesson created as a draft");
      router.push(`/admin/lessons?worldId=${worldId}`);
    });
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pb-20">
        <BasicsSection
          worldTitle={worldTitle}
          kind={kind}
          kindEditable
          onKindChange={changeKind}
          status={null}
          editable
        />
        <TextSection disabled={false} warnings={warnings} />
        <ContentSection kind={kind} disabled={false} warnings={warnings} />

        <div className={cn(GLASS_PANEL_SUBTLE, "sticky bottom-0 z-10 flex items-center gap-2 p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]")}>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating..." : "Create draft"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!formState.isDirty || window.confirm("Discard unsaved changes to this lesson?")) {
                router.push(`/admin/lessons?worldId=${worldId}`);
              }
            }}
            disabled={isPending}
          >
            Cancel
          </Button>
          {formState.isDirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        </div>
      </form>
    </FormProvider>
  );
}

// ---------------------------------------------------------------------------
// Existing lesson form
// ---------------------------------------------------------------------------

export function LessonForm({
  worldTitle,
  worldMentorKey,
  lesson,
  canEdit,
  canDelete,
}: {
  worldTitle: LocalizedText;
  worldMentorKey: string | null;
  lesson: LessonRow;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [publishSummary, setPublishSummary] = useState<string[]>([]);

  const kind = lesson.kind as CreatableKind;
  const kindRef = useRef(kind);
  kindRef.current = kind;
  const resolver = useDynamicLessonResolver(kindRef);

  const defaultValues = useMemo<LessonFormValues>(
    () => ({
      chapter: lesson.chapter,
      step: lesson.step,
      title: lesson.title,
      blurb: lesson.blurb,
      content: contentToFormValues(kind, lesson.content),
    }),
    [lesson, kind],
  );
  // Snapshot of this lesson's own content, taken once per lesson/kind - see
  // extractUnknownContentKeys's comment. Frozen at load, since nothing in
  // the form can ever edit these keys.
  const unknownContentKeys = useMemo(
    () => extractUnknownContentKeys(kind, lesson.content),
    [lesson, kind],
  );

  const methods = useForm<LessonFormValues>({ resolver, defaultValues });
  const { handleSubmit, watch, reset, setError, clearErrors, formState } = methods;

  useUnsavedChangesGuard(formState.isDirty);

  const [title, blurb, content] = watch(["title", "blurb", "content"]);
  const warnings = useMemo(() => computeLessonWarnings(kind, title, blurb, content), [kind, title, blurb, content]);

  const isDraft = lesson.status === "draft";
  const editable = canEdit && isDraft;
  // D20/D23 (docs/ARCHITECTURE.md): a published lesson's title/blurb/content
  // can still be hotfixed directly - requires lesson.delete, the same
  // trust bar as publishing. The ONLY fix path for a boss_quiz lesson,
  // since unpublishing one is hard-blocked below.
  const hotfixable = canDelete && !isDraft;
  const contentEditable = editable || hotfixable;
  const isBossQuiz = lesson.kind === "boss_quiz";
  // Chapter/step stay draft-only even when a hotfix is otherwise allowed -
  // same rule as before this redesign.
  const structuralEditable = editable;

  // Doubt Zone scripts are written in a specific mentor's voice
  // (content.mentorKey, fixed at authoring time) - if the world's current
  // mentor has since changed, warn rather than silently letting a
  // mismatched script get published. See docs/ARCHITECTURE.md D19.
  const scriptedMentorKey =
    lesson.kind === "doubt_zone" && typeof lesson.content === "object" && lesson.content !== null
      ? (lesson.content as { mentorKey?: unknown }).mentorKey
      : undefined;
  const mentorMismatch =
    typeof scriptedMentorKey === "string" &&
    worldMentorKey !== null &&
    scriptedMentorKey !== worldMentorKey;

  function onSaveDraft(values: LessonFormValues) {
    startTransition(async () => {
      const result = await updateLessonDraftAction({
        id: lesson.id,
        worldId: lesson.worldId,
        chapter: values.chapter,
        step: values.step,
        title: values.title,
        blurb: values.blurb,
        content: { ...unknownContentKeys, ...formValuesToContent(kind, values.content) },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Draft saved");
      reset(values);
    });
  }

  function onSaveHotfix(values: LessonFormValues) {
    startTransition(async () => {
      const result = await hotfixLessonAction({
        id: lesson.id,
        title: values.title,
        blurb: values.blurb,
        content: { ...unknownContentKeys, ...formValuesToContent(kind, values.content) },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Fix saved - live immediately");
      reset(values);
    });
  }

  function publish() {
    clearErrors();
    setPublishSummary([]);
    startTransition(async () => {
      const result = await publishLessonAction({ id: lesson.id });
      if (!result.ok) {
        const { fieldErrors, summary } = parsePublishError(result.error);
        fieldErrors.forEach(({ path, message }) =>
          setError(path as FieldPath<LessonFormValues>, { type: "server", message }),
        );
        setPublishSummary(summary.length > 0 ? summary : fieldErrors.length === 0 ? [result.error] : []);
        toast.error("Can't publish yet - see the errors below.");
        return;
      }
      toast.success("Published");
    });
  }

  function unpublish() {
    // D23 (docs/ARCHITECTURE.md): a soft warning, not a server-side block
    // (unlike the boss_quiz block, which the Unpublish button isn't even
    // shown for) - unpublishing a lesson learners are mid-way through will
    // 404 them until it's republished or fixed. Save fix is the
    // lower-disruption alternative.
    if (lesson.inProgressLearnerCount > 0) {
      setConfirmUnpublish(true);
      return;
    }
    doUnpublish();
  }

  function doUnpublish() {
    startTransition(async () => {
      const result = await unpublishLessonAction({ id: lesson.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Unpublished - back to draft");
    });
  }

  function openPreview() {
    startTransition(async () => {
      const result = await previewLessonAction({ id: lesson.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPreview(result.data);
    });
  }

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={handleSubmit(editable ? onSaveDraft : onSaveHotfix)}
        className="space-y-4 pb-20"
      >
        {mentorMismatch && (
          <div className="rounded-md border border-status-draft-fg/30 bg-status-draft-bg p-3 text-sm text-status-draft-fg">
            This Doubt Zone script was written for mentor &quot;{scriptedMentorKey}&quot;, but this
            world&apos;s current mentor is &quot;{worldMentorKey}&quot;. Review the script before
            publishing.
          </div>
        )}

        {!isDraft && (
          <p className="text-xs text-muted-foreground">
            Published - title/blurb/content can be fixed directly below. Chapter/step need unpublish
            first.
          </p>
        )}

        {!isDraft && lesson.inProgressLearnerCount > 0 && (
          <Badge variant="info">
            {lesson.inProgressLearnerCount} learner{lesson.inProgressLearnerCount > 1 ? "s" : ""} mid-lesson
          </Badge>
        )}

        {isBossQuiz && !isDraft && (
          <div className="rounded-md border border-status-draft-fg/30 bg-status-draft-bg p-3 text-sm text-status-draft-fg">
            This is a world&apos;s Boss Quiz - it can never be unpublished (it gates every later
            world&apos;s unlock). Use &quot;Save fix&quot; to correct it instead.
          </div>
        )}

        {publishSummary.length > 0 && (
          <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <p className="font-medium">Can&apos;t publish yet:</p>
            <ul className="ml-4 list-disc">
              {publishSummary.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        <BasicsSection
          worldTitle={worldTitle}
          kind={kind}
          kindEditable={false}
          status={lesson.status}
          editable={structuralEditable}
        />
        <TextSection disabled={!contentEditable} warnings={warnings} />
        <ContentSection kind={lesson.kind} disabled={!contentEditable} warnings={warnings} />

        <StoredJsonPanel
          data={{
            id: lesson.id,
            chapter: lesson.chapter,
            step: lesson.step,
            kind: lesson.kind,
            status: lesson.status,
            title: lesson.title,
            blurb: lesson.blurb,
            content: lesson.content,
          }}
        />

        <div className={cn(GLASS_PANEL_SUBTLE, "sticky bottom-0 z-10 flex flex-wrap items-center gap-2 p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]")}>
          {(editable || hotfixable) && (
            <Button type="submit" variant="outline" disabled={isPending}>
              {editable ? "Save draft" : "Save fix"}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!formState.isDirty || window.confirm("Discard unsaved changes to this lesson?")) {
                reset();
                router.push(`/admin/lessons/${lesson.id}`);
              }
            }}
            disabled={isPending}
          >
            Cancel
          </Button>
          {canDelete && isDraft && (
            <Button type="button" onClick={publish} disabled={isPending}>
              Publish
            </Button>
          )}
          {canDelete && !isDraft && !isBossQuiz && (
            <Button type="button" variant="outline" onClick={unpublish} disabled={isPending}>
              Unpublish
            </Button>
          )}
          <Button type="button" variant="outline" onClick={openPreview} disabled={isPending}>
            Preview
          </Button>
          {formState.isDirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        </div>
      </form>

      {preview && <LessonPreview data={preview} onClose={() => setPreview(null)} />}

      <ConfirmDialog
        open={confirmUnpublish}
        onOpenChange={setConfirmUnpublish}
        title="Unpublish this lesson?"
        description={
          `${lesson.inProgressLearnerCount} learner${lesson.inProgressLearnerCount > 1 ? "s are" : " is"} ` +
          `currently mid-lesson on this. Unpublishing will 404 them until it's fixed or republished - ` +
          `consider "Save fix" instead if you're just correcting content.`
        }
        confirmLabel="Unpublish anyway"
        onConfirm={() => {
          setConfirmUnpublish(false);
          doUnpublish();
        }}
      />
    </FormProvider>
  );
}
