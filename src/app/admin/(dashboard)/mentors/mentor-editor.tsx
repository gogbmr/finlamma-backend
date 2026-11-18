"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  FormProvider,
  useForm,
  useFormContext,
  type FieldPath,
  type Resolver,
} from "react-hook-form";
import { toast } from "sonner";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { LocalizedText } from "@/server/mentors/schemas";
import { CreateMentorDraftSchema, HotfixMentorSchema, UpdateMentorDraftSchema } from "@/server/mentors/schemas";
import {
  createMentorDraftAction,
  hotfixMentorAction,
  publishMentorAction,
  unpublishMentorAction,
  updateMentorDraftAction,
  uploadMentorArtAction,
} from "./actions";
import { MentorsTable } from "./mentors-table";

type UsedByWorld = { id: string; title: LocalizedText; status: "draft" | "published" };

type MentorRow = {
  id: string;
  key: string;
  order: number;
  name: LocalizedText;
  bio: LocalizedText;
  persona: string;
  status: "draft" | "published";
  artUrl: string | null;
  usedByWorlds: UsedByWorld[];
};

const LANGUAGES = ["en", "hi", "hx"] as const;
const WARNABLE_LANGUAGES = ["hi", "hx"] as const; // en is required by the base schema already
const EMPTY_LOCALIZED: LocalizedText = { en: "", hi: "", hx: "" };

// ---------------------------------------------------------------------------
// Non-blocking warnings: empty hi/hx in name/bio - previews what
// validateMentorForPublish (src/server/mentors/service.ts) will actually
// enforce at publish/hotfix time. Never blocks handleSubmit/draft save.
// ---------------------------------------------------------------------------

type Warning = { path: string; message: string };

function warnIfEmpty(value: LocalizedText | undefined, pathPrefix: string, label: string): Warning[] {
  if (!value) return [];
  return WARNABLE_LANGUAGES.filter((lang) => !value[lang]?.trim()).map((lang) => ({
    path: `${pathPrefix}.${lang}`,
    message: `${label} (${lang}) is empty - required before publish.`,
  }));
}

function computeMentorWarnings(name: LocalizedText, bio: LocalizedText): Warning[] {
  return [...warnIfEmpty(name, "name", "Name"), ...warnIfEmpty(bio, "bio", "Bio")];
}

function findWarning(warnings: Warning[], path: string): string | undefined {
  return warnings.find((w) => w.path === path)?.message;
}

// Maps validateMentorForPublish's one message shape
// ("Cannot publish: missing translation(s) for name.en, bio.hi") onto RHF
// field paths, and a light best-effort match for the unique-violation
// messages createMentorDraft/updateMentorDraft throw (order/key already in
// use) - everything else (NOT_FOUND, CONFLICT from "still published", ...)
// falls through to the summary box untouched.
function parseMentorError(message: string): { fieldErrors: Warning[]; summary: string[] } {
  const missingMatch = message.match(/^Cannot publish: missing translations? for (.+)$/);
  if (missingMatch) {
    const fieldErrors = missingMatch[1]!.split(",").map((rawPath) => ({
      path: rawPath.trim(),
      message: "Missing translation - required before publish.",
    }));
    return { fieldErrors, summary: [] };
  }
  if (/\border\b.*already in use/i.test(message)) {
    return { fieldErrors: [{ path: "order", message }], summary: [] };
  }
  if (/\bkey\b.*already in use/i.test(message)) {
    return { fieldErrors: [{ path: "key", message }], summary: [] };
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

// en/hi/hx grouped SIDE BY SIDE for one field, each column clearly
// labelled - same pattern as lessons'/questions' LocalizedFieldGroup.
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
              <Textarea {...register(path)} disabled={disabled} className="min-h-20" />
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

// Read-only escape hatch, same as lessons'/questions' StoredJsonPanel.
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

// Art upload is kept exactly as it was: the same uploadMentorArtAction
// (byte-sniffed format check + 2MB cap, src/server/mentors/service.ts's
// uploadMentorArt) - this component is UI-only, showing the current image,
// a replace input, and the size/type hint.
function ArtSection({
  artUrl,
  disabled,
  publishedHint,
  onUpload,
  isPending,
}: {
  artUrl: string | null;
  disabled: boolean;
  publishedHint: boolean;
  onUpload: (file: File) => void;
  isPending: boolean;
}) {
  return (
    <SectionCard title="Art">
      {artUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset
        <img src={artUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
      ) : (
        <p className="text-xs text-muted-foreground">No art uploaded yet.</p>
      )}
      {!disabled && (
        <div className="space-y-1">
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
            }}
          />
          <p className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 2MB.</p>
          {publishedHint && (
            <p className="text-xs text-muted-foreground">
              This mentor is published - replacing its art requires mentor.publish.
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
}

export function MentorEditor({
  mentors,
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
  mentors: MentorRow[];
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
  const [selectedId, setSelectedId] = useState<string | "new" | null>(mentors[0]?.id ?? "new");
  const [isDirty, setIsDirty] = useState(false);

  function trySelect(id: string | "new") {
    if (
      isDirty &&
      typeof window !== "undefined" &&
      !window.confirm("Discard unsaved changes to this mentor?")
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
  // while dirty (search/sort/pager/status filters) - a capturing
  // document-level listener, no change to data-table.tsx/mentors-table.tsx,
  // no new package. Same approach as lessons/questions.
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
      if (!window.confirm("Discard unsaved changes to this mentor?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isDirty]);

  if (total === 0 && !canManage) {
    return (
      <EmptyState
        icon={Users}
        title="No mentors yet"
        description="A staff member with mentor.manage can create the first one."
      />
    );
  }

  const effectiveId: string | "new" =
    selectedId === "new" || mentors.some((m) => m.id === selectedId)
      ? (selectedId as string | "new")
      : mentors[0]?.id ?? "new";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Select a mentor below to edit it.</p>
        {canManage && (
          <Button type="button" size="sm" onClick={() => trySelect("new")}>
            + New mentor
          </Button>
        )}
      </div>

      <MentorsTable
        rows={mentors.map((m) => ({ id: m.id, key: m.key, order: m.order, name: m.name, status: m.status }))}
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
        <NewMentorForm onDirtyChange={setIsDirty} />
      ) : (
        (() => {
          const mentor = mentors.find((m) => m.id === effectiveId);
          if (!mentor) return null;
          return (
            <MentorForm
              key={mentor.id}
              mentor={mentor}
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

type NewMentorFormValues = {
  key: string;
  order: number;
  persona: string;
  name: LocalizedText;
  bio: LocalizedText;
};

function NewMentorForm({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const [isPending, startTransition] = useTransition();
  const methods = useForm<NewMentorFormValues>({
    resolver: zodResolver(CreateMentorDraftSchema),
    defaultValues: { key: "", order: 1, persona: "", name: EMPTY_LOCALIZED, bio: EMPTY_LOCALIZED },
  });
  const { handleSubmit, watch, register, reset, formState } = methods;

  useEffect(() => {
    onDirtyChange(formState.isDirty);
  }, [formState.isDirty, onDirtyChange]);

  const [name, bio] = watch(["name", "bio"]);
  const warnings = useMemo(() => computeMentorWarnings(name, bio), [name, bio]);

  function onSubmit(values: NewMentorFormValues) {
    startTransition(async () => {
      const result = await createMentorDraftAction(values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Mentor created as a draft");
      reset({ key: "", order: 1, persona: "", name: EMPTY_LOCALIZED, bio: EMPTY_LOCALIZED });
    });
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pb-20">
        <SectionCard title="Basics">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Key (slug)</Label>
              <Input {...register("key")} placeholder="baby" />
              {formState.errors.key && (
                <p className="text-xs text-destructive">{formState.errors.key.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Display order</Label>
              <Input type="number" {...register("order", { valueAsNumber: true })} />
              {formState.errors.order && (
                <p className="text-xs text-destructive">{formState.errors.order.message}</p>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Text">
          <LocalizedFieldGroup label="Name" name="name" disabled={false} warnings={warnings} />
          <LocalizedFieldGroup label="Bio" name="bio" disabled={false} warnings={warnings} />
          <div className="space-y-1">
            <Label>Persona / voice notes (Doubt Zone AI chat)</Label>
            <Textarea
              {...register("persona")}
              placeholder="e.g. Straightforward and strict, focused on numbers and discipline, no excuses."
            />
          </div>
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

type MentorFormValues = {
  order: number;
  persona: string;
  name: LocalizedText;
  bio: LocalizedText;
};

// `id` is handled outside the form entirely (mentor.id, a closure
// constant - never user-editable) - the resolver schemas below are the
// real UpdateMentorDraftSchema/HotfixMentorSchema with `id` omitted, so
// the client-side validation shape always matches what the server action
// actually re-validates, just without a field for something that can
// never change.
function useDynamicMentorResolver(modeRef: { current: "update" | "hotfix" }): Resolver<MentorFormValues> {
  return useMemo(() => {
    const dynamicResolver = async (values: unknown, context: unknown, options: unknown) => {
      const schema =
        modeRef.current === "hotfix" ? HotfixMentorSchema.omit({ id: true }) : UpdateMentorDraftSchema.omit({ id: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return zodResolver(schema)(values as any, context as any, options as any);
    };
    return dynamicResolver as unknown as Resolver<MentorFormValues>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function MentorForm({
  mentor,
  canManage,
  canPublish,
  onDirtyChange,
}: {
  mentor: MentorRow;
  canManage: boolean;
  canPublish: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [errorSummary, setErrorSummary] = useState<string[]>([]);

  const isDraft = mentor.status === "draft";
  const editable = canManage && isDraft;
  // D20 (docs/ARCHITECTURE.md): a published mentor's name/bio can still be
  // hotfixed directly - requires mentor.publish, the same trust bar as
  // publishing. `order`/`persona` stay draft-only.
  const hotfixable = canPublish && !isDraft;
  const nameBioEditable = editable || hotfixable;

  const modeRef = useRef<"update" | "hotfix">(editable ? "update" : "hotfix");
  modeRef.current = editable ? "update" : "hotfix";
  const resolver = useDynamicMentorResolver(modeRef);

  const defaultValues = useMemo<MentorFormValues>(
    () => ({ order: mentor.order, persona: mentor.persona, name: mentor.name, bio: mentor.bio }),
    [mentor],
  );

  const methods = useForm<MentorFormValues>({ resolver, defaultValues });
  const { handleSubmit, watch, register, reset, setError, clearErrors, formState } = methods;

  useEffect(() => {
    onDirtyChange(formState.isDirty);
  }, [formState.isDirty, onDirtyChange]);

  const [name, bio] = watch(["name", "bio"]);
  const warnings = useMemo(() => computeMentorWarnings(name, bio), [name, bio]);

  function applyServerError(message: string) {
    clearErrors();
    const { fieldErrors, summary } = parseMentorError(message);
    fieldErrors.forEach(({ path, message: fieldMessage }) =>
      setError(path as FieldPath<MentorFormValues>, { type: "server", message: fieldMessage }),
    );
    setErrorSummary(summary.length > 0 ? summary : fieldErrors.length === 0 ? [message] : []);
  }

  function onSaveDraft(values: MentorFormValues) {
    setErrorSummary([]);
    startTransition(async () => {
      const result = await updateMentorDraftAction({ id: mentor.id, ...values });
      if (!result.ok) {
        applyServerError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Draft saved");
      reset(values);
    });
  }

  function onSaveHotfix(values: MentorFormValues) {
    setErrorSummary([]);
    startTransition(async () => {
      const result = await hotfixMentorAction({ id: mentor.id, name: values.name, bio: values.bio });
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
      const result = await publishMentorAction({ id: mentor.id });
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
      const result = await unpublishMentorAction({ id: mentor.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Unpublished - back to draft");
    });
  }

  function uploadArt(file: File) {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("id", mentor.id);
      formData.append("file", file);
      const result = await uploadMentorArtAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Art uploaded");
    });
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(editable ? onSaveDraft : onSaveHotfix)} className="space-y-4 pb-20">
        {!isDraft && (
          <p className="text-xs text-muted-foreground">
            Published - only name/bio can be fixed directly below. Everything else needs unpublish
            first.
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

        <SectionCard title="Basics">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Key (fixed)</Label>
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                {mentor.key}
              </p>
            </div>
            <div className="space-y-1">
              <Label>Display order</Label>
              <Input type="number" disabled={!editable} {...register("order", { valueAsNumber: true })} />
              {formState.errors.order && (
                <p className="text-xs text-destructive">{formState.errors.order.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <div>
                <StatusBadge status={mentor.status}>{mentor.status}</StatusBadge>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Text">
          <LocalizedFieldGroup label="Name" name="name" disabled={!nameBioEditable} warnings={warnings} />
          <LocalizedFieldGroup label="Bio" name="bio" disabled={!nameBioEditable} warnings={warnings} />
          <div className="space-y-1">
            <Label>Persona / voice notes (Doubt Zone AI chat)</Label>
            <Textarea {...register("persona")} disabled={!editable} />
          </div>
        </SectionCard>

        <ArtSection
          artUrl={mentor.artUrl}
          disabled={!(canManage || canPublish)}
          publishedHint={!isDraft}
          onUpload={uploadArt}
          isPending={isPending}
        />

        <SectionCard title="Relations">
          <p className="text-sm font-medium text-foreground">Used by</p>
          {mentor.usedByWorlds.length === 0 ? (
            <p className="text-xs text-muted-foreground">No worlds reference this mentor yet.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {mentor.usedByWorlds.map((w) => (
                <li key={w.id}>
                  <StatusBadge status={w.status}>{w.title.en || "(untitled)"}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <StoredJsonPanel
          data={{
            id: mentor.id,
            key: mentor.key,
            order: mentor.order,
            status: mentor.status,
            name: mentor.name,
            bio: mentor.bio,
            persona: mentor.persona,
          }}
        />

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-border bg-card p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          {(editable || hotfixable) && (
            <Button type="submit" variant="outline" disabled={isPending}>
              {editable ? "Save draft" : "Save fix"}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => reset()} disabled={isPending}>
            Cancel
          </Button>
          {canPublish && isDraft && (
            <Button type="button" onClick={publish} disabled={isPending}>
              Publish
            </Button>
          )}
          {canPublish && !isDraft && (
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
