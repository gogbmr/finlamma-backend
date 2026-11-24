"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Info, MessageSquareText, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ComponentType } from "react";
import {
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
  type FieldPath,
  type Resolver,
} from "react-hook-form";
import { toast } from "sonner";
import { StatusBadge } from "@/components/admin/status-badge";
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
import {
  QUESTION_ANSWER_TEMPLATES,
  QUESTION_PAYLOAD_TEMPLATES,
  validateAnswerBounds,
  type QuestionFormat,
} from "@/server/questions/schemas";
import {
  createQuestionDraftAction,
  hotfixQuestionAction,
  publishQuestionAction,
  unpublishQuestionAction,
  updateQuestionDraftAction,
} from "./actions";
import {
  appendParallelEntry,
  buildQuestionFormSchema,
  extractUnknownAnswerKeys,
  extractUnknownPayloadKeys,
  FORMATS,
  parseQuestionError,
  removeParallelEntry,
  renumberOrderAfterRemoval,
} from "./question-content";

export const FORMAT_LABELS: Record<QuestionFormat, string> = {
  single_select: "Single select",
  ordering: "Ordering",
  sort_buckets: "Sort into 2 buckets",
  fill_blank: "Fill in the blank",
  match_pairs: "Match pairs",
  spot_mistake: "Spot the mistake",
  number_guess: "Number guess (slider)",
};

// The full record, as QuestionForm needs it - fetched directly by the
// view/edit pages (getQuestionDetailForAdmin), never all at once: the
// Questions list is real-DB-paginated (Task 3b), so unlike the small
// catalogs the full table is never sitting in memory.
export type QuestionRow = {
  id: string;
  format: QuestionFormat;
  topicId: string | null;
  prompt: LocalizedText;
  explanation: LocalizedText;
  payload: unknown;
  answer: unknown;
  status: "draft" | "published";
};

// The lightweight row the admin list itself needs - exactly what
// src/server/questions/admin-queries.ts's listQuestionsForAdmin returns.
export type QuestionListRow = {
  id: string;
  format: QuestionFormat;
  topicId: string | null;
  promptEn: string;
  status: "draft" | "published";
};

type TopicOption = { id: string; name: LocalizedText };

// Radix Select rejects an empty-string item value, so "no topic" needs its
// own sentinel - mapped back to/from null at the edges, never stored or
// sent to the server as a string.
const NO_TOPIC = "__none__";

function TopicSelect({
  topics,
  value,
  onChange,
  disabled,
}: {
  topics: TopicOption[];
  value: string | null;
  onChange: (topicId: string | null) => void;
  disabled: boolean;
}) {
  return (
    <Select
      value={value ?? NO_TOPIC}
      onValueChange={(v) => onChange(v === NO_TOPIC ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_TOPIC}>No topic</SelectItem>
        {topics.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name.en}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const LANGUAGES = ["en", "hi", "hx"] as const;
const WARNABLE_LANGUAGES = ["hi", "hx"] as const; // en is required by the base schema already
const EMPTY_LOCALIZED: LocalizedText = { en: "", hi: "", hx: "" };

type QuestionFormValues = {
  topicId: string | null;
  prompt: LocalizedText;
  explanation: LocalizedText;
  // Loosely typed, same reasoning as lessons' LessonFormValues.content - the
  // real shape is one of 7 format-specific schemas, dispatched at runtime
  // by the section components below.
  payload: Record<string, unknown>;
  answer: Record<string, unknown>;
};

// Wraps zodResolver so the schema used for validation always matches the
// LIVE format, without remounting the whole form when format changes
// (which would reset prompt/explanation too). Standard RHF pattern for
// "resolver depends on another field's value" - same approach as lessons'
// useDynamicLessonResolver.
function useDynamicQuestionResolver(formatRef: { current: QuestionFormat }): Resolver<QuestionFormValues> {
  return useMemo(() => {
    const dynamicResolver = async (values: unknown, context: unknown, options: unknown) => {
      const schema = buildQuestionFormSchema(formatRef.current);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return zodResolver(schema)(values as any, context as any, options as any);
    };
    return dynamicResolver as unknown as Resolver<QuestionFormValues>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ---------------------------------------------------------------------------
// Non-blocking warnings: empty hi/hx in prompt/explanation/payload leaves,
// and every validateAnswerBounds() cross-field problem (answer.correctIndex
// out of range, a non-permutation correctOrder, mismatched array lengths,
// ...) - reused directly from src/server/questions/schemas.ts, never
// reimplemented, so this can never silently drift from the real save-time
// gate (validatePayloadAndAnswer in service.ts calls the exact same
// function). These never block handleSubmit/draft save - that check is
// just the structural Zod shape (buildQuestionFormSchema) - only render as
// inline notices next to the field they're about, previewing what save/
// publish will actually enforce.
// ---------------------------------------------------------------------------

type Warning = { path: string; message: string };

function warnIfEmpty(value: LocalizedText | undefined, pathPrefix: string, label: string): Warning[] {
  if (!value) return [];
  return WARNABLE_LANGUAGES.filter((lang) => !value[lang]?.trim()).map((lang) => ({
    path: `${pathPrefix}.${lang}`,
    message: `${label} (${lang}) is empty - required before publish.`,
  }));
}

function warnIfEmptyList(values: LocalizedText[] | undefined, pathPrefix: string, label: string): Warning[] {
  if (!Array.isArray(values)) return [];
  return values.flatMap((v, i) => warnIfEmpty(v, `${pathPrefix}.${i}`, `${label} ${i + 1}`));
}

function computeQuestionWarnings(
  format: QuestionFormat,
  prompt: LocalizedText,
  explanation: LocalizedText,
  payload: Record<string, unknown>,
  answer: Record<string, unknown>,
): Warning[] {
  const warnings: Warning[] = [
    ...warnIfEmpty(prompt, "prompt", "Prompt"),
    ...warnIfEmpty(explanation, "explanation", "Explanation"),
  ];

  if (format === "single_select") {
    warnings.push(...warnIfEmptyList(payload.options as LocalizedText[], "payload.options", "Option"));
  } else if (format === "ordering") {
    warnings.push(...warnIfEmptyList(payload.pool as LocalizedText[], "payload.pool", "Pool item"));
  } else if (format === "sort_buckets") {
    warnings.push(...warnIfEmptyList(payload.items as LocalizedText[], "payload.items", "Item"));
    warnings.push(...warnIfEmptyList(payload.buckets as LocalizedText[], "payload.buckets", "Bucket"));
  } else if (format === "fill_blank") {
    warnings.push(
      ...warnIfEmptyList(payload.sentenceParts as LocalizedText[], "payload.sentenceParts", "Sentence part"),
    );
    warnings.push(...warnIfEmptyList(payload.pool as LocalizedText[], "payload.pool", "Pool word"));
  } else if (format === "match_pairs") {
    warnings.push(...warnIfEmptyList(payload.left as LocalizedText[], "payload.left", "Left item"));
    warnings.push(...warnIfEmptyList(payload.right as LocalizedText[], "payload.right", "Right item"));
  } else if (format === "spot_mistake") {
    warnings.push(...warnIfEmptyList(payload.lines as LocalizedText[], "payload.lines", "Line"));
  } else if (format === "number_guess") {
    warnings.push(...warnIfEmpty(payload.unit as LocalizedText, "payload.unit", "Unit"));
  }

  // The exact same cross-field bounds check the server runs at save time
  // (validatePayloadAndAnswer) and publish time - previewed here so a
  // staff member sees it before clicking Save, not only after the server
  // rejects it.
  for (const message of validateAnswerBounds(format, payload, answer)) {
    const match = message.match(/^((?:payload|answer)(?:\.\w+|\[\d+\])*)/);
    const path = match ? match[1]!.replace(/\[(\d+)\]/g, ".$1") : "answer";
    warnings.push({ path, message });
  }

  return warnings;
}

function findWarning(warnings: Warning[], path: string): string | undefined {
  return warnings.find((w) => w.path === path)?.message;
}

// Unsaved-changes guard for a question form living on its own page (create/
// edit) - part 1: browser tab-close/reload/navigate-away, part 2:
// intercepts a click on any same-page link while dirty. Same approach as
// worlds/lessons; previously lived once in the now-removed QuestionEditor
// wrapper (when create/edit were both inline on the list page, and edit
// loaded its full record on demand via QuestionDetailLoader - also removed,
// since the dedicated view/edit pages fetch it directly server-side
// instead), now each standalone form owns its own guard directly.
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
      if (!window.confirm("Discard unsaved changes to this question?")) {
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

// en/hi/hx grouped SIDE BY SIDE for one field, each column clearly
// labelled - same pattern as lessons' LocalizedFieldGroup.
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
                <Textarea {...register(path as FieldPath<QuestionFormValues>)} disabled={disabled} className="min-h-16" />
              ) : (
                <Input {...register(path as FieldPath<QuestionFormValues>)} disabled={disabled} />
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

// Read-only escape hatch, same as lessons' StoredJsonPanel - shows the
// question exactly as loaded (never the live-edited form state), so it
// stays a trustworthy "what's stored" reference while the form above it is
// mid-edit.
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

function BasicsSection({
  format,
  formatEditable,
  onFormatChange,
  topics,
  topicId,
  onTopicChange,
  topicEditable,
  status,
}: {
  format: QuestionFormat;
  formatEditable: boolean;
  onFormatChange?: (format: QuestionFormat) => void;
  topics: TopicOption[];
  topicId: string | null;
  onTopicChange: (topicId: string | null) => void;
  topicEditable: boolean;
  status: "draft" | "published" | null;
}) {
  return (
    <SectionCard title="Basics" icon={Info}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>Format</Label>
          {formatEditable ? (
            <Select value={format} onValueChange={(v) => onFormatChange?.(v as QuestionFormat)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMATS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {FORMAT_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
              {FORMAT_LABELS[format]} <span className="text-muted-foreground">(fixed)</span>
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label>Topic (optional)</Label>
          <TopicSelect topics={topics} value={topicId} onChange={onTopicChange} disabled={!topicEditable} />
        </div>
        {status && (
          <div className="space-y-1">
            <Label>Status</Label>
            <div>
              <StatusBadge status={status}>{status}</StatusBadge>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Format payload + answer sections, one per format - Task 5a. Where the
// answer is naturally keyed off the SAME payload row (sort_buckets' bucket
// choice, match_pairs' pairing), payload and answer are combined into one
// visual section instead of two separate ones, since splitting them would
// force cross-referencing row numbers across two separate lists - an
// interpretation, noted in this round's summary. Every payload array here
// is already an array of LocalizedText objects (useFieldArray works on it
// directly, no wrapping needed); every answer array is a plain number[]
// parallel to one of those payload arrays, so it's driven by plain
// register()/setValue() at the SAME index, never its own useFieldArray -
// see question-content.ts's header comment for why no format needs the
// {value: X} wrapping trick lessons' quiz-like questionIds needed.
// ---------------------------------------------------------------------------

function OptionRow({
  index,
  name,
  disabled,
  warnings,
  onRemove,
  removable,
}: {
  index: number;
  name: string;
  disabled: boolean;
  warnings: Warning[];
  onRemove: () => void;
  removable: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-2 w-6 text-xs text-muted-foreground">{index + 1}.</span>
      <div className="flex-1">
        <LocalizedFieldGroup label={`Item ${index + 1}`} name={name} disabled={disabled} warnings={warnings} multiline={false} />
      </div>
      {!disabled && removable && (
        <Button type="button" variant="outline" size="sm" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </Button>
      )}
    </div>
  );
}

function SingleSelectSections({ disabled, warnings }: { disabled: boolean; warnings: Warning[] }) {
  const { control, watch, setValue } = useFormContext();
  const options = useFieldArray({ control, name: "payload.options" });
  const liveOptions = useWatch({ control, name: "payload.options" }) as LocalizedText[] | undefined;
  const correctIndex = watch("answer.correctIndex" as FieldPath<QuestionFormValues>) as unknown as number;

  return (
    <>
      <SectionCard title="Payload - Options">
        {options.fields.map((field, i) => (
          <OptionRow
            key={field.id}
            index={i}
            name={`payload.options.${i}`}
            disabled={disabled}
            warnings={warnings}
            removable={options.fields.length > 2}
            onRemove={() => options.remove(i)}
          />
        ))}
        {!disabled && (
          <Button type="button" variant="outline" size="sm" onClick={() => options.append(EMPTY_LOCALIZED)}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add option
          </Button>
        )}
      </SectionCard>
      <SectionCard title="Answer">
        <Label>Correct option</Label>
        <Select
          value={String(correctIndex ?? 0)}
          onValueChange={(v) => setValue("answer.correctIndex" as FieldPath<QuestionFormValues>, Number(v) as never, { shouldValidate: true })}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(liveOptions ?? []).map((opt, i) => (
              <SelectItem key={i} value={String(i)}>
                {i + 1}. {opt?.en || "(untitled)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {findWarning(warnings, "answer.correctIndex") && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 text-xs text-amber-700 dark:text-amber-400">
            {findWarning(warnings, "answer.correctIndex")}
          </p>
        )}
      </SectionCard>
    </>
  );
}

function OrderingSections({ disabled, warnings }: { disabled: boolean; warnings: Warning[] }) {
  const { control, getValues, setValue } = useFormContext();
  const pool = useFieldArray({ control, name: "payload.pool" });
  const livePool = useWatch({ control, name: "payload.pool" }) as LocalizedText[] | undefined;
  const liveOrder = useWatch({ control, name: "answer.correctOrder" }) as number[] | undefined;

  function addItem() {
    const order = (getValues("answer.correctOrder") as number[]) ?? [];
    pool.append(EMPTY_LOCALIZED);
    setValue("answer.correctOrder", appendParallelEntry(order, order.length));
  }
  function removeItem(i: number) {
    pool.remove(i);
    const order = (getValues("answer.correctOrder" as FieldPath<QuestionFormValues>) as unknown as number[]) ?? [];
    setValue("answer.correctOrder" as FieldPath<QuestionFormValues>, renumberOrderAfterRemoval(order, i) as never);
  }

  return (
    <>
      <SectionCard title="Payload - Pool">
        {pool.fields.map((field, i) => (
          <OptionRow
            key={field.id}
            index={i}
            name={`payload.pool.${i}`}
            disabled={disabled}
            warnings={warnings}
            removable={pool.fields.length > 2}
            onRemove={() => removeItem(i)}
          />
        ))}
        {!disabled && (
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add pool item
          </Button>
        )}
      </SectionCard>
      <SectionCard title="Answer - Correct order">
        <p className="text-xs text-muted-foreground">Pick which pool item belongs in each position.</p>
        {(liveOrder ?? []).map((poolIndex, position) => (
          <div key={position} className="flex items-center gap-2">
            <span className="w-20 text-xs text-muted-foreground">Position {position + 1}</span>
            <Select
              value={String(poolIndex)}
              onValueChange={(v) =>
                setValue(`answer.correctOrder.${position}` as FieldPath<QuestionFormValues>, Number(v) as never, {
                  shouldValidate: true,
                })
              }
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(livePool ?? []).map((item, idx) => (
                  <SelectItem key={idx} value={String(idx)}>
                    {idx + 1}. {item?.en || "(untitled)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        {findWarning(warnings, "answer.correctOrder") && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 text-xs text-amber-700 dark:text-amber-400">
            {findWarning(warnings, "answer.correctOrder")}
          </p>
        )}
      </SectionCard>
    </>
  );
}

function SortBucketsSections({ disabled, warnings }: { disabled: boolean; warnings: Warning[] }) {
  const { control, getValues, setValue } = useFormContext();
  const items = useFieldArray({ control, name: "payload.items" });
  const liveBuckets = useWatch({ control, name: "payload.buckets" }) as LocalizedText[] | undefined;
  const liveAssignments = useWatch({ control, name: "answer.bucketByItemIndex" }) as number[] | undefined;

  function addItem() {
    items.append(EMPTY_LOCALIZED);
    const arr = (getValues("answer.bucketByItemIndex" as FieldPath<QuestionFormValues>) as unknown as number[]) ?? [];
    setValue("answer.bucketByItemIndex" as FieldPath<QuestionFormValues>, appendParallelEntry(arr, 0) as never);
  }
  function removeItem(i: number) {
    items.remove(i);
    const arr = (getValues("answer.bucketByItemIndex" as FieldPath<QuestionFormValues>) as unknown as number[]) ?? [];
    setValue("answer.bucketByItemIndex" as FieldPath<QuestionFormValues>, removeParallelEntry(arr, i) as never);
  }

  return (
    <>
      <SectionCard title="Payload - Bucket labels">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LocalizedFieldGroup label="Bucket 0 label" name="payload.buckets.0" disabled={disabled} warnings={warnings} multiline={false} />
          <LocalizedFieldGroup label="Bucket 1 label" name="payload.buckets.1" disabled={disabled} warnings={warnings} multiline={false} />
        </div>
      </SectionCard>
      <SectionCard title="Payload - Items & Answer">
        {items.fields.map((field, i) => (
          <div key={field.id} className={cn(GLASS_PANEL_SUBTLE, "flex items-start gap-2 p-2")}>
            <div className="flex-1">
              <LocalizedFieldGroup label={`Item ${i + 1}`} name={`payload.items.${i}`} disabled={disabled} warnings={warnings} multiline={false} />
            </div>
            <div className="w-44 space-y-1">
              <Label>Belongs in</Label>
              <Select
                value={String(liveAssignments?.[i] ?? 0)}
                onValueChange={(v) =>
                  setValue(`answer.bucketByItemIndex.${i}` as FieldPath<QuestionFormValues>, Number(v) as never, {
                    shouldValidate: true,
                  })
                }
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">{liveBuckets?.[0]?.en || "Bucket 0"}</SelectItem>
                  <SelectItem value="1">{liveBuckets?.[1]?.en || "Bucket 1"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!disabled && items.fields.length > 2 && (
              <Button type="button" variant="outline" size="sm" onClick={() => removeItem(i)}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            )}
          </div>
        ))}
        {!disabled && (
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add item
          </Button>
        )}
        {findWarning(warnings, "answer.bucketByItemIndex") && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 text-xs text-amber-700 dark:text-amber-400">
            {findWarning(warnings, "answer.bucketByItemIndex")}
          </p>
        )}
      </SectionCard>
    </>
  );
}

function FillBlankSections({ disabled, warnings }: { disabled: boolean; warnings: Warning[] }) {
  const { control, setValue } = useFormContext();
  const parts = useFieldArray({ control, name: "payload.sentenceParts" });
  const pool = useFieldArray({ control, name: "payload.pool" });
  const livePool = useWatch({ control, name: "payload.pool" }) as LocalizedText[] | undefined;
  const liveFills = useWatch({ control, name: "answer.correctFillIndices" }) as number[] | undefined;

  // Restructuring the sentence legitimately invalidates the previous
  // blank-to-word mapping (there's no obviously-correct auto-remap for
  // which blank corresponds to which old blank) - reset to a safe default
  // (every blank points at pool[0]) and let the staff re-pick, rather than
  // risk a silently-wrong carried-over mapping.
  function resetFillsForPartsLength(newPartsLength: number) {
    const blankCount = Math.max(0, newPartsLength - 1);
    setValue("answer.correctFillIndices" as FieldPath<QuestionFormValues>, new Array(blankCount).fill(0) as never);
  }

  return (
    <>
      <SectionCard title="Payload - Sentence parts & word pool">
        <p className="text-xs text-muted-foreground">A blank sits between every consecutive pair of parts.</p>
        {parts.fields.map((field, i) => (
          <div key={field.id} className="flex items-start gap-2">
            <span className="mt-2 w-16 text-xs text-muted-foreground">Part {i + 1}</span>
            <div className="flex-1">
              <LocalizedFieldGroup label={`Part ${i + 1}`} name={`payload.sentenceParts.${i}`} disabled={disabled} warnings={warnings} />
            </div>
            {!disabled && parts.fields.length > 2 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  parts.remove(i);
                  resetFillsForPartsLength(parts.fields.length - 1);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            )}
          </div>
        ))}
        {!disabled && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              parts.append(EMPTY_LOCALIZED);
              resetFillsForPartsLength(parts.fields.length + 1);
            }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add part
          </Button>
        )}

        <div className="space-y-2 pt-2">
          <Label>Word pool</Label>
          {pool.fields.map((field, i) => (
            <OptionRow
              key={field.id}
              index={i}
              name={`payload.pool.${i}`}
              disabled={disabled}
              warnings={warnings}
              removable={pool.fields.length > 1}
              onRemove={() => pool.remove(i)}
            />
          ))}
          {!disabled && (
            <Button type="button" variant="outline" size="sm" onClick={() => pool.append(EMPTY_LOCALIZED)}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Add word
            </Button>
          )}
        </div>
      </SectionCard>
      <SectionCard title="Answer - Fill each blank">
        {(liveFills ?? []).map((poolIdx, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-20 text-xs text-muted-foreground">Blank {i + 1}</span>
            <Select
              value={String(poolIdx)}
              onValueChange={(v) =>
                setValue(`answer.correctFillIndices.${i}` as FieldPath<QuestionFormValues>, Number(v) as never, {
                  shouldValidate: true,
                })
              }
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(livePool ?? []).map((w, idx) => (
                  <SelectItem key={idx} value={String(idx)}>
                    {idx + 1}. {w?.en || "(untitled)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        {findWarning(warnings, "answer.correctFillIndices") && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 text-xs text-amber-700 dark:text-amber-400">
            {findWarning(warnings, "answer.correctFillIndices")}
          </p>
        )}
      </SectionCard>
    </>
  );
}

function MatchPairsSections({ disabled, warnings }: { disabled: boolean; warnings: Warning[] }) {
  const { control, getValues, setValue } = useFormContext();
  const left = useFieldArray({ control, name: "payload.left" });
  const right = useFieldArray({ control, name: "payload.right" });
  const liveRight = useWatch({ control, name: "payload.right" }) as LocalizedText[] | undefined;
  const liveMapping = useWatch({ control, name: "answer.rightIndexByLeftIndex" }) as number[] | undefined;

  function addLeft() {
    left.append(EMPTY_LOCALIZED);
    const arr = (getValues("answer.rightIndexByLeftIndex" as FieldPath<QuestionFormValues>) as unknown as number[]) ?? [];
    setValue("answer.rightIndexByLeftIndex" as FieldPath<QuestionFormValues>, appendParallelEntry(arr, 0) as never);
  }
  function removeLeft(i: number) {
    left.remove(i);
    const arr = (getValues("answer.rightIndexByLeftIndex" as FieldPath<QuestionFormValues>) as unknown as number[]) ?? [];
    setValue("answer.rightIndexByLeftIndex" as FieldPath<QuestionFormValues>, removeParallelEntry(arr, i) as never);
  }

  return (
    <>
      <SectionCard title="Payload - Right column">
        {right.fields.map((field, i) => (
          <OptionRow
            key={field.id}
            index={i}
            name={`payload.right.${i}`}
            disabled={disabled}
            warnings={warnings}
            removable={right.fields.length > 2}
            onRemove={() => right.remove(i)}
          />
        ))}
        {!disabled && (
          <Button type="button" variant="outline" size="sm" onClick={() => right.append(EMPTY_LOCALIZED)}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add right item
          </Button>
        )}
      </SectionCard>
      <SectionCard title="Payload - Left column & Answer">
        {left.fields.map((field, i) => (
          <div key={field.id} className={cn(GLASS_PANEL_SUBTLE, "flex items-start gap-2 p-2")}>
            <div className="flex-1">
              <LocalizedFieldGroup label={`Left ${i + 1}`} name={`payload.left.${i}`} disabled={disabled} warnings={warnings} multiline={false} />
            </div>
            <div className="w-56 space-y-1">
              <Label>Pairs with</Label>
              <Select
                value={String(liveMapping?.[i] ?? 0)}
                onValueChange={(v) =>
                  setValue(`answer.rightIndexByLeftIndex.${i}` as FieldPath<QuestionFormValues>, Number(v) as never, {
                    shouldValidate: true,
                  })
                }
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(liveRight ?? []).map((r, idx) => (
                    <SelectItem key={idx} value={String(idx)}>
                      {idx + 1}. {r?.en || "(untitled)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!disabled && left.fields.length > 2 && (
              <Button type="button" variant="outline" size="sm" onClick={() => removeLeft(i)}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            )}
          </div>
        ))}
        {!disabled && (
          <Button type="button" variant="outline" size="sm" onClick={addLeft}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add left item
          </Button>
        )}
        {findWarning(warnings, "answer.rightIndexByLeftIndex") && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 text-xs text-amber-700 dark:text-amber-400">
            {findWarning(warnings, "answer.rightIndexByLeftIndex")}
          </p>
        )}
      </SectionCard>
    </>
  );
}

function SpotMistakeSections({ disabled, warnings }: { disabled: boolean; warnings: Warning[] }) {
  const { control, getValues, setValue } = useFormContext();
  const lines = useFieldArray({ control, name: "payload.lines" });
  const liveLines = useWatch({ control, name: "payload.lines" }) as LocalizedText[] | undefined;
  const wrongLineIndex = useWatch({ control, name: "answer.wrongLineIndex" }) as number | undefined;

  // payload.lineSources (an optional, parallel-to-lines citation tag array)
  // has no input of its own in this editor - see question-content.ts's
  // comment on why it stays a KNOWN field instead of a passthrough one.
  // Kept length-synced here so adding/removing a line never leaves it
  // mismatched against `lines` (a save-time blocking bounds check if so).
  function syncSourcesLength(next: (LocalizedText | null)[]) {
    setValue("payload.lineSources" as FieldPath<QuestionFormValues>, next as never);
  }
  function addLine() {
    lines.append(EMPTY_LOCALIZED);
    const sources = getValues("payload.lineSources" as FieldPath<QuestionFormValues>) as unknown as
      | (LocalizedText | null)[]
      | undefined;
    if (Array.isArray(sources)) syncSourcesLength(appendParallelEntry(sources, null));
  }
  function removeLine(i: number) {
    lines.remove(i);
    const sources = getValues("payload.lineSources" as FieldPath<QuestionFormValues>) as unknown as
      | (LocalizedText | null)[]
      | undefined;
    if (Array.isArray(sources)) syncSourcesLength(removeParallelEntry(sources, i));
  }

  return (
    <>
      <SectionCard title="Payload - Lines">
        {lines.fields.map((field, i) => (
          <OptionRow
            key={field.id}
            index={i}
            name={`payload.lines.${i}`}
            disabled={disabled}
            warnings={warnings}
            removable={lines.fields.length > 2}
            onRemove={() => removeLine(i)}
          />
        ))}
        {!disabled && (
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add line
          </Button>
        )}
      </SectionCard>
      <SectionCard title="Answer - Which line is wrong">
        <Select
          value={String(wrongLineIndex ?? 0)}
          onValueChange={(v) =>
            setValue("answer.wrongLineIndex" as FieldPath<QuestionFormValues>, Number(v) as never, {
              shouldValidate: true,
            })
          }
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(liveLines ?? []).map((line, idx) => (
              <SelectItem key={idx} value={String(idx)}>
                {idx + 1}. {line?.en || "(untitled)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {findWarning(warnings, "answer.wrongLineIndex") && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 text-xs text-amber-700 dark:text-amber-400">
            {findWarning(warnings, "answer.wrongLineIndex")}
          </p>
        )}
      </SectionCard>
    </>
  );
}

function NumberGuessSections({ disabled, warnings }: { disabled: boolean; warnings: Warning[] }) {
  const { register } = useFormContext();
  return (
    <>
      <SectionCard title="Payload - Slider range">
        <LocalizedFieldGroup label="Unit label" name="payload.unit" disabled={disabled} warnings={warnings} multiline={false} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>Min</Label>
            <Input type="number" step="any" disabled={disabled} {...register("payload.min" as FieldPath<QuestionFormValues>, { valueAsNumber: true })} />
          </div>
          <div className="space-y-1">
            <Label>Max</Label>
            <Input type="number" step="any" disabled={disabled} {...register("payload.max" as FieldPath<QuestionFormValues>, { valueAsNumber: true })} />
          </div>
          <div className="space-y-1">
            <Label>Step</Label>
            <Input type="number" step="any" min={0} disabled={disabled} {...register("payload.step" as FieldPath<QuestionFormValues>, { valueAsNumber: true })} />
          </div>
        </div>
        {findWarning(warnings, "payload.max") && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 text-xs text-amber-700 dark:text-amber-400">
            {findWarning(warnings, "payload.max")}
          </p>
        )}
      </SectionCard>
      <SectionCard title="Answer - Correct value">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Correct value</Label>
            <Input type="number" step="any" disabled={disabled} {...register("answer.correctValue" as FieldPath<QuestionFormValues>, { valueAsNumber: true })} />
          </div>
          <div className="space-y-1">
            <Label>Tolerance (+/-)</Label>
            <Input type="number" step="any" min={0} disabled={disabled} {...register("answer.tolerance" as FieldPath<QuestionFormValues>, { valueAsNumber: true })} />
          </div>
        </div>
        {findWarning(warnings, "answer.correctValue") && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 text-xs text-amber-700 dark:text-amber-400">
            {findWarning(warnings, "answer.correctValue")}
          </p>
        )}
        {findWarning(warnings, "answer.tolerance") && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 text-xs text-amber-700 dark:text-amber-400">
            {findWarning(warnings, "answer.tolerance")}
          </p>
        )}
      </SectionCard>
    </>
  );
}

function ContentSections({ format, disabled, warnings }: { format: QuestionFormat; disabled: boolean; warnings: Warning[] }) {
  switch (format) {
    case "single_select":
      return <SingleSelectSections disabled={disabled} warnings={warnings} />;
    case "ordering":
      return <OrderingSections disabled={disabled} warnings={warnings} />;
    case "sort_buckets":
      return <SortBucketsSections disabled={disabled} warnings={warnings} />;
    case "fill_blank":
      return <FillBlankSections disabled={disabled} warnings={warnings} />;
    case "match_pairs":
      return <MatchPairsSections disabled={disabled} warnings={warnings} />;
    case "spot_mistake":
      return <SpotMistakeSections disabled={disabled} warnings={warnings} />;
    case "number_guess":
      return <NumberGuessSections disabled={disabled} warnings={warnings} />;
  }
}

// ---------------------------------------------------------------------------
// New question form
// ---------------------------------------------------------------------------

export function NewQuestionForm({ topics }: { topics: TopicOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [format, setFormat] = useState<QuestionFormat>("single_select");
  const formatRef = useRef<QuestionFormat>(format);
  formatRef.current = format;
  const resolver = useDynamicQuestionResolver(formatRef);

  const methods = useForm<QuestionFormValues>({
    resolver,
    defaultValues: {
      topicId: null,
      prompt: EMPTY_LOCALIZED,
      explanation: EMPTY_LOCALIZED,
      payload: QUESTION_PAYLOAD_TEMPLATES.single_select as Record<string, unknown>,
      answer: QUESTION_ANSWER_TEMPLATES.single_select as Record<string, unknown>,
    },
  });
  const { handleSubmit, watch, setValue, reset, formState } = methods;

  useUnsavedChangesGuard(formState.isDirty);

  const [topicId, prompt, explanation, payload, answer] = watch(["topicId", "prompt", "explanation", "payload", "answer"]);
  const warnings = useMemo(
    () => computeQuestionWarnings(format, prompt, explanation, payload, answer),
    [format, prompt, explanation, payload, answer],
  );

  function changeFormat(newFormat: QuestionFormat) {
    setFormat(newFormat);
    reset(
      {
        ...methods.getValues(),
        payload: QUESTION_PAYLOAD_TEMPLATES[newFormat] as Record<string, unknown>,
        answer: QUESTION_ANSWER_TEMPLATES[newFormat] as Record<string, unknown>,
      },
      { keepDirty: true },
    );
  }

  function onSubmit(values: QuestionFormValues) {
    startTransition(async () => {
      const result = await createQuestionDraftAction({
        format,
        topicId: values.topicId,
        prompt: values.prompt,
        explanation: values.explanation,
        payload: values.payload,
        answer: values.answer,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Question created as a draft");
      router.push("/admin/questions");
    });
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pb-20">
        <BasicsSection
          format={format}
          formatEditable
          onFormatChange={changeFormat}
          topics={topics}
          topicId={topicId}
          onTopicChange={(v) => setValue("topicId", v, { shouldValidate: true })}
          topicEditable
          status={null}
        />
        <SectionCard title="Prompt" icon={MessageSquareText}>
          <LocalizedFieldGroup label="Prompt" name="prompt" disabled={false} warnings={warnings} />
        </SectionCard>
        <ContentSections format={format} disabled={false} warnings={warnings} />
        <SectionCard title="Explanation" icon={Info}>
          <LocalizedFieldGroup label="Explanation" name="explanation" disabled={false} warnings={warnings} />
        </SectionCard>

        <div className={cn(GLASS_PANEL_SUBTLE, "sticky bottom-0 z-10 flex items-center gap-2 p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]")}>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating..." : "Create draft"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!formState.isDirty || window.confirm("Discard unsaved changes to this question?")) {
                router.push("/admin/questions");
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
// Existing question form
// ---------------------------------------------------------------------------

export function QuestionForm({
  question,
  topics,
  canEdit,
  canDelete,
}: {
  question: QuestionRow;
  topics: TopicOption[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorSummary, setErrorSummary] = useState<string[]>([]);

  const format = question.format;
  const formatRef = useRef(format);
  formatRef.current = format;
  const resolver = useDynamicQuestionResolver(formatRef);

  const defaultValues = useMemo<QuestionFormValues>(
    () => ({
      topicId: question.topicId,
      prompt: question.prompt,
      explanation: question.explanation,
      payload: (question.payload as Record<string, unknown>) ?? {},
      answer: (question.answer as Record<string, unknown>) ?? {},
    }),
    [question],
  );
  // Snapshot of this question's own payload/answer, taken once per
  // question - a save/publish failure never discards a field this form
  // doesn't know about (see question-content.ts's extractUnknown*Keys).
  const unknownPayloadKeys = useMemo(() => extractUnknownPayloadKeys(format, question.payload), [format, question.payload]);
  const unknownAnswerKeys = useMemo(() => extractUnknownAnswerKeys(format, question.answer), [format, question.answer]);

  const methods = useForm<QuestionFormValues>({ resolver, defaultValues });
  const { handleSubmit, watch, setValue, reset, setError, clearErrors, formState } = methods;

  useUnsavedChangesGuard(formState.isDirty);

  const [topicId, prompt, explanation, payload, answer] = watch(["topicId", "prompt", "explanation", "payload", "answer"]);
  const warnings = useMemo(
    () => computeQuestionWarnings(format, prompt, explanation, payload, answer),
    [format, prompt, explanation, payload, answer],
  );

  const isDraft = question.status === "draft";
  const editable = canEdit && isDraft;
  // D20 (docs/ARCHITECTURE.md): a published question's prompt/explanation/
  // payload/answer can still be hotfixed directly - requires
  // question.delete, the same trust bar as publishing. Topic stays
  // draft-only.
  const hotfixable = canDelete && !isDraft;
  const contentEditable = editable || hotfixable;

  function applyServerError(message: string) {
    clearErrors();
    const { fieldErrors, summary } = parseQuestionError(message);
    fieldErrors.forEach(({ path, message: fieldMessage }) =>
      setError(path as FieldPath<QuestionFormValues>, { type: "server", message: fieldMessage }),
    );
    setErrorSummary(summary.length > 0 ? summary : fieldErrors.length === 0 ? [message] : []);
  }

  function onSaveDraft(values: QuestionFormValues) {
    setErrorSummary([]);
    startTransition(async () => {
      const result = await updateQuestionDraftAction({
        id: question.id,
        topicId: values.topicId,
        prompt: values.prompt,
        explanation: values.explanation,
        payload: { ...unknownPayloadKeys, ...values.payload },
        answer: { ...unknownAnswerKeys, ...values.answer },
      });
      if (!result.ok) {
        applyServerError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Draft saved");
      reset(values);
    });
  }

  function onSaveHotfix(values: QuestionFormValues) {
    setErrorSummary([]);
    startTransition(async () => {
      const result = await hotfixQuestionAction({
        id: question.id,
        prompt: values.prompt,
        explanation: values.explanation,
        payload: { ...unknownPayloadKeys, ...values.payload },
        answer: { ...unknownAnswerKeys, ...values.answer },
      });
      if (!result.ok) {
        applyServerError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Fix saved - live immediately");
      reset(values);
    });
  }

  function publish() {
    setErrorSummary([]);
    clearErrors();
    startTransition(async () => {
      const result = await publishQuestionAction({ id: question.id });
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
      const result = await unpublishQuestionAction({ id: question.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Unpublished - back to draft");
    });
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(editable ? onSaveDraft : onSaveHotfix)} className="space-y-4 pb-20">
        {!isDraft && (
          <p className="text-xs text-muted-foreground">
            Published - prompt/explanation/payload/answer can be fixed directly below. Topic needs
            unpublish first.
          </p>
        )}

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

        <BasicsSection
          format={format}
          formatEditable={false}
          topics={topics}
          topicId={topicId}
          onTopicChange={(v) => setValue("topicId", v, { shouldValidate: true })}
          topicEditable={editable}
          status={question.status}
        />
        <SectionCard title="Prompt" icon={MessageSquareText}>
          <LocalizedFieldGroup label="Prompt" name="prompt" disabled={!contentEditable} warnings={warnings} />
        </SectionCard>
        <ContentSections format={format} disabled={!contentEditable} warnings={warnings} />
        <SectionCard title="Explanation" icon={Info}>
          <LocalizedFieldGroup label="Explanation" name="explanation" disabled={!contentEditable} warnings={warnings} />
        </SectionCard>

        <StoredJsonPanel
          data={{
            id: question.id,
            format: question.format,
            topicId: question.topicId,
            status: question.status,
            prompt: question.prompt,
            explanation: question.explanation,
            payload: question.payload,
            answer: question.answer,
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
              if (!formState.isDirty || window.confirm("Discard unsaved changes to this question?")) {
                reset();
                router.push(`/admin/questions/${question.id}`);
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
