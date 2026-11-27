"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Images, Link2, Type } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ComponentType } from "react";
import {
  FormProvider,
  useForm,
  useFormContext,
  type FieldPath,
  type Resolver,
} from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
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
import type { LocalizedText } from "@/server/shared/schemas";
import {
  CreateWorldDraftSchema,
  HotfixWorldSchema,
  UpdateWorldDraftSchema,
  WorldCodeSchema,
} from "@/server/worlds/schemas";
import {
  createWorldDraftAction,
  hotfixWorldAction,
  publishWorldAction,
  reorderWorldAction,
  unpublishWorldAction,
  updateWorldDraftAction,
  uploadWorldArtAction,
  uploadWorldCardMediaAction,
} from "./actions";
import { cn } from "@/lib/cn";
import { GLASS_PANEL, GLASS_PANEL_SUBTLE, GlassIconChip } from "@/components/admin/glass";

export type WorldRow = {
  id: string;
  order: number;
  code: string | null;
  title: LocalizedText;
  tagline: LocalizedText;
  theme: string;
  displayXpTarget: number;
  mentorId: string;
  status: "draft" | "published";
  artUrl: string | null;
  cardMediaUrl: string | null;
};

export type MentorOption = { id: string; key: string; name: LocalizedText; status: "draft" | "published" };
export type DoubtZoneLessonRef = { id: string; title: LocalizedText; mentorKey: string };

const LANGUAGES = ["en", "hi", "hx"] as const;
const WARNABLE_LANGUAGES = ["hi", "hx"] as const; // en is required by the base schema already
const EMPTY_LOCALIZED: LocalizedText = { en: "", hi: "", hx: "" };

// A plain text input never naturally produces `null` - "" is what an empty
// Input gives - so the code field's own nullable/optional schema (which
// only ever treats an absent/null VALUE as "no code yet") would otherwise
// reject an untouched empty field against WorldCodeSchema's 2-uppercase-
// letter regex. This preprocessing step is the only reason this isn't just
// WorldCodeSchema.nullable().optional() reused verbatim - same regex,
// same rule, just mapping the empty-string case admin text inputs actually
// produce onto the "no code" value the schema already expects.
const FormCodeSchema = z.preprocess((v) => (v === "" ? null : v), WorldCodeSchema.nullable().optional());

// ---------------------------------------------------------------------------
// Non-blocking warnings: empty hi/hx in title/tagline, and a missing
// certificate code - previews what validateWorldForPublish
// (src/server/worlds/service.ts) will actually enforce at publish/hotfix
// time. Never blocks handleSubmit/draft save.
// ---------------------------------------------------------------------------

type Warning = { path: string; message: string };

function warnIfEmpty(value: LocalizedText | undefined, pathPrefix: string, label: string): Warning[] {
  if (!value) return [];
  return WARNABLE_LANGUAGES.filter((lang) => !value[lang]?.trim()).map((lang) => ({
    path: `${pathPrefix}.${lang}`,
    message: `${label} (${lang}) is empty - required before publish.`,
  }));
}

function computeWorldWarnings(title: LocalizedText, tagline: LocalizedText, code: string | null): Warning[] {
  const warnings = [...warnIfEmpty(title, "title", "Title"), ...warnIfEmpty(tagline, "tagline", "Tagline")];
  if (!code) {
    warnings.push({ path: "code", message: "Certificate code is empty - required before publish." });
  }
  return warnings;
}

function findWarning(warnings: Warning[], path: string): string | undefined {
  return warnings.find((w) => w.path === path)?.message;
}

// Maps validateWorldForPublish's one message shape ("Cannot publish:
// missing title.en, code") onto RHF field paths, plus the other publish-
// time CONFLICTs (no Boss Quiz yet, mentor not published) and the
// unique-violation messages createWorldDraft/updateWorldDraft throw
// (order/code already in use) - everything else falls through to the
// summary box untouched.
function parseWorldError(message: string): { fieldErrors: Warning[]; summary: string[] } {
  const missingMatch = message.match(/^Cannot publish: missing (.+)$/);
  if (missingMatch) {
    const fieldErrors = missingMatch[1]!.split(",").map((rawField) => {
      const path = rawField.trim();
      return {
        path,
        message: path === "code" ? "Certificate code is required before publish." : "Missing translation - required before publish.",
      };
    });
    return { fieldErrors, summary: [] };
  }
  if (/\border\b.*already in use/i.test(message)) {
    return { fieldErrors: [{ path: "order", message }], summary: [] };
  }
  if (/\bcode\b.*already in use/i.test(message)) {
    return { fieldErrors: [{ path: "code", message }], summary: [] };
  }
  if (/\bmentor\b/i.test(message) && /not published/i.test(message)) {
    return { fieldErrors: [{ path: "mentorId", message }], summary: [] };
  }
  return { fieldErrors: [], summary: [message] };
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

// Art upload is kept exactly as it was: the same uploadWorldArtAction
// (byte-sniffed format check + 2MB cap, src/server/worlds/service.ts's
// uploadWorldArt) - this component is UI-only.
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
    <SectionCard title="Art" icon={Images}>
      {artUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset
        <img src={artUrl} alt="" className="h-24 w-40 rounded-lg border border-border object-cover shadow-sm" />
      ) : (
        <div className="flex h-24 w-40 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-xs text-muted-foreground">
          No art yet
        </div>
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
              This world is published - replacing its art requires world.delete.
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// Second, independent upload control - mirrors ArtSection above exactly,
// just pointed at cardMediaUrl/cardMediaKey instead of artUrl/artKey (the
// static fallback ArtSection manages stays completely separate). The real
// checks (byte-sniffed format including GIF, 1.5MB cap) live in
// uploadWorldCardMedia (src/server/worlds/service.ts) - this is UI-only.
function CardMediaSection({
  cardMediaUrl,
  disabled,
  publishedHint,
  onUpload,
  isPending,
}: {
  cardMediaUrl: string | null;
  disabled: boolean;
  publishedHint: boolean;
  onUpload: (file: File) => void;
  isPending: boolean;
}) {
  return (
    <SectionCard title="Card background (animated)" icon={Images}>
      {cardMediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset
        <img src={cardMediaUrl} alt="" className="h-24 w-40 rounded-lg border border-border object-cover shadow-sm" />
      ) : (
        <div className="flex h-24 w-40 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-xs text-muted-foreground">
          No card background yet
        </div>
      )}
      {!disabled && (
        <div className="space-y-1">
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
            }}
          />
          <p className="text-xs text-muted-foreground">
            PNG, JPEG, WebP or GIF, up to 1.5MB - shown instead of the static art above when set; the
            static art is always kept as the fallback if this fails to load.
          </p>
          {publishedHint && (
            <p className="text-xs text-muted-foreground">
              This world is published - replacing its card background requires world.delete.
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function MentorRelationSection({
  mentors,
  value,
  onChange,
  disabled,
}: {
  mentors: MentorOption[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <SectionCard title="Relations" icon={Link2}>
      <Label>Mentor</Label>
      <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Pick a mentor" />
        </SelectTrigger>
        <SelectContent>
          {mentors.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name.en || m.key} ({m.status})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Publishing this world requires the chosen mentor to already be published.
      </p>
    </SectionCard>
  );
}

// Unsaved-changes guard for a world form living on its own page (create/
// edit) - part 1: browser tab-close/reload/navigate-away, part 2:
// intercepts a click on any same-page link while dirty. Same approach as
// lessons/questions/mentors; previously lived once in the now-removed
// WorldEditor wrapper (when create/edit were both inline on the list page),
// now each standalone form owns its own guard directly.
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
      if (!window.confirm("Discard unsaved changes to this world?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isDirty]);
}

const NewWorldFormSchema = CreateWorldDraftSchema.extend({ code: FormCodeSchema });
type NewWorldFormValues = {
  order: number;
  code: string | null;
  theme: string;
  displayXpTarget: number;
  mentorId: string;
  title: LocalizedText;
  tagline: LocalizedText;
};

export function NewWorldForm({ mentors }: { mentors: MentorOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const methods = useForm<NewWorldFormValues>({
    // FormCodeSchema's z.preprocess makes zod's static inference widen
    // `code` to `unknown` (it can't know the preprocess narrows to
    // string|null), so the resolver's inferred type never quite matches
    // NewWorldFormValues even though it validates the exact same shape at
    // runtime - same bridging cast used throughout lessons/questions for
    // an analogous "the live type is intentionally looser than what zod
    // can statically prove" case.
    resolver: zodResolver(NewWorldFormSchema) as unknown as Resolver<NewWorldFormValues>,
    defaultValues: {
      order: 1,
      code: null,
      theme: "",
      displayXpTarget: 0,
      mentorId: "",
      title: EMPTY_LOCALIZED,
      tagline: EMPTY_LOCALIZED,
    },
  });
  const { handleSubmit, watch, register, setValue, formState } = methods;

  useUnsavedChangesGuard(formState.isDirty);

  const [title, tagline, code, mentorId] = watch(["title", "tagline", "code", "mentorId"]);
  const warnings = useMemo(() => computeWorldWarnings(title, tagline, code), [title, tagline, code]);

  function onSubmit(values: NewWorldFormValues) {
    startTransition(async () => {
      const result = await createWorldDraftAction(values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("World created as a draft");
      router.push("/admin/worlds");
    });
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pb-20">
        <SectionCard title="Basics" icon={Info}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Display order</Label>
              <Input type="number" {...register("order", { valueAsNumber: true })} />
              {formState.errors.order && (
                <p className="text-xs text-destructive">{formState.errors.order.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Certificate code</Label>
              <Input
                {...register("code")}
                maxLength={2}
                placeholder="MW"
                onChange={(e) => setValue("code", e.target.value.toUpperCase(), { shouldValidate: true })}
              />
              <p className="text-xs text-muted-foreground">
                2 uppercase letters, unique - required before this world can publish.
              </p>
              {formState.errors.code && (
                <p className="text-xs text-destructive">{formState.errors.code.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Theme (cosmetic accent color)</Label>
              <div className="flex items-center gap-2">
                <span
                  className="h-9 w-9 shrink-0 rounded-md border border-border"
                  style={{ backgroundColor: watch("theme") || "transparent" }}
                  aria-hidden
                />
                <Input {...register("theme")} placeholder="#7C3AED" />
              </div>
              {formState.errors.theme && (
                <p className="text-xs text-destructive">{formState.errors.theme.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Display XP target (cosmetic only)</Label>
              <Input type="number" {...register("displayXpTarget", { valueAsNumber: true })} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Text" icon={Type}>
          <LocalizedFieldGroup label="Title" name="title" disabled={false} warnings={warnings} />
          <LocalizedFieldGroup label="Tagline" name="tagline" disabled={false} warnings={warnings} />
        </SectionCard>

        <MentorRelationSection
          mentors={mentors}
          value={mentorId}
          onChange={(v) => setValue("mentorId", v, { shouldValidate: true })}
          disabled={false}
        />

        <div className={cn(GLASS_PANEL_SUBTLE, "sticky bottom-0 z-10 flex items-center gap-2 p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]")}>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating..." : "Create draft"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!formState.isDirty || window.confirm("Discard unsaved changes to this world?")) {
                router.push("/admin/worlds");
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

type WorldFormValues = {
  order: number;
  code: string | null;
  theme: string;
  displayXpTarget: number;
  mentorId: string;
  title: LocalizedText;
  tagline: LocalizedText;
};

// Same reasoning as mentors' useDynamicMentorResolver: `id` is handled
// outside the form (world.id, a closure constant), and the resolver
// schemas are the real UpdateWorldDraftSchema/HotfixWorldSchema (with
// `id` omitted, and FormCodeSchema's empty-string-to-null preprocessing
// swapped in for `code`) - never a hand-rolled copy.
function useDynamicWorldResolver(modeRef: { current: "update" | "hotfix" }): Resolver<WorldFormValues> {
  return useMemo(() => {
    const dynamicResolver = async (values: unknown, context: unknown, options: unknown) => {
      const schema =
        modeRef.current === "hotfix"
          ? HotfixWorldSchema.omit({ id: true })
          : UpdateWorldDraftSchema.omit({ id: true, code: true }).extend({ code: FormCodeSchema });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return zodResolver(schema)(values as any, context as any, options as any);
    };
    return dynamicResolver as unknown as Resolver<WorldFormValues>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function WorldForm({
  world,
  mentors,
  doubtZoneLessons,
  canEdit,
  canDelete,
}: {
  world: WorldRow;
  mentors: MentorOption[];
  doubtZoneLessons: DoubtZoneLessonRef[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorSummary, setErrorSummary] = useState<string[]>([]);
  const [reorderTarget, setReorderTarget] = useState("");
  const [confirmMentorChange, setConfirmMentorChange] = useState(false);

  const isDraft = world.status === "draft";
  const editable = canEdit && isDraft;
  // D20 (docs/ARCHITECTURE.md): a published world's title/tagline can
  // still be hotfixed directly - requires world.delete, the same trust
  // bar as publishing. order/code/theme/displayXpTarget/mentorId stay
  // draft-only.
  const hotfixable = canDelete && !isDraft;
  const titleTaglineEditable = editable || hotfixable;

  const modeRef = useRef<"update" | "hotfix">(editable ? "update" : "hotfix");
  modeRef.current = editable ? "update" : "hotfix";
  const resolver = useDynamicWorldResolver(modeRef);

  const defaultValues = useMemo<WorldFormValues>(
    () => ({
      order: world.order,
      code: world.code,
      theme: world.theme,
      displayXpTarget: world.displayXpTarget,
      mentorId: world.mentorId,
      title: world.title,
      tagline: world.tagline,
    }),
    [world],
  );

  const methods = useForm<WorldFormValues>({ resolver, defaultValues });
  const { handleSubmit, watch, register, setValue, reset, setError, clearErrors, formState } = methods;

  useUnsavedChangesGuard(formState.isDirty);

  const [title, tagline, code, mentorId] = watch(["title", "tagline", "code", "mentorId"]);
  const warnings = useMemo(() => computeWorldWarnings(title, tagline, code), [title, tagline, code]);

  // Changing the mentor away from what it was when this form loaded
  // doesn't retroactively update any Doubt Zone script's own
  // content.mentorKey (fixed at authoring time - see
  // docs/ARCHITECTURE.md D19), so warn with exactly which scripts are now
  // written for a mentor this world is about to stop using, before the
  // change is saved.
  const originalMentorKey = mentors.find((m) => m.id === world.mentorId)?.key ?? null;
  const mentorChanged = mentorId !== world.mentorId;
  const affectedDoubtZoneLessons =
    mentorChanged && originalMentorKey
      ? doubtZoneLessons.filter((l) => l.mentorKey === originalMentorKey)
      : [];

  function applyServerError(message: string) {
    clearErrors();
    const { fieldErrors, summary } = parseWorldError(message);
    fieldErrors.forEach(({ path, message: fieldMessage }) =>
      setError(path as FieldPath<WorldFormValues>, { type: "server", message: fieldMessage }),
    );
    setErrorSummary(summary.length > 0 ? summary : fieldErrors.length === 0 ? [message] : []);
  }

  function onSaveDraft(values: WorldFormValues) {
    if (affectedDoubtZoneLessons.length > 0) {
      setConfirmMentorChange(true);
      return;
    }
    doSaveDraft(values);
  }

  function doSaveDraft(values: WorldFormValues) {
    setErrorSummary([]);
    startTransition(async () => {
      const result = await updateWorldDraftAction({ id: world.id, ...values });
      if (!result.ok) {
        applyServerError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Draft saved");
      reset(values);
    });
  }

  function onSaveHotfix(values: WorldFormValues) {
    setErrorSummary([]);
    startTransition(async () => {
      const result = await hotfixWorldAction({ id: world.id, title: values.title, tagline: values.tagline });
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
      const result = await publishWorldAction({ id: world.id });
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
      const result = await unpublishWorldAction({ id: world.id });
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
      formData.append("id", world.id);
      formData.append("file", file);
      const result = await uploadWorldArtAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Art uploaded");
    });
  }

  function uploadCardMedia(file: File) {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("id", world.id);
      formData.append("file", file);
      const result = await uploadWorldCardMediaAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Card background uploaded");
    });
  }

  function reorder() {
    const target = Number(reorderTarget);
    if (!target) return;
    startTransition(async () => {
      const result = await reorderWorldAction({ id: world.id, newOrder: target });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Moved to position ${target}`);
    });
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(editable ? onSaveDraft : onSaveHotfix)} className="space-y-4 pb-20">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <StatusBadge status={world.status}>{world.status}</StatusBadge>
          {!isDraft && (
            <span className="text-xs text-muted-foreground">
              Published - only title/tagline can be fixed directly below. Everything else needs
              unpublish first.
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

        {affectedDoubtZoneLessons.length > 0 && (
          <div className="rounded-md border border-status-draft-fg/30 bg-status-draft-bg p-3 text-sm text-status-draft-fg">
            Changing the mentor will leave {affectedDoubtZoneLessons.length} Doubt Zone lesson
            {affectedDoubtZoneLessons.length > 1 ? "s" : ""} scripted for the old mentor (
            {originalMentorKey}):
            <ul className="ml-4 list-disc">
              {affectedDoubtZoneLessons.map((l) => (
                <li key={l.id}>{l.title.en || l.id}</li>
              ))}
            </ul>
            You&apos;ll be asked to confirm again when you save.
          </div>
        )}

        {(canEdit || canDelete) && (
          <div className={cn(GLASS_PANEL_SUBTLE, "flex items-end gap-2 p-3")}>
            <div className="space-y-1">
              <Label>Move to position</Label>
              <Input
                type="number"
                className="w-24"
                value={reorderTarget}
                onChange={(e) => setReorderTarget(e.target.value)}
                placeholder={String(world.order)}
              />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={reorder} disabled={isPending}>
              Move
            </Button>
            <p className="text-xs text-muted-foreground">
              Works on published worlds too, and shifts everyone between the old and new position -
              no unpublish needed. Requires world.delete, not just world.edit.
            </p>
          </div>
        )}

        <SectionCard title="Basics" icon={Info}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Display order</Label>
              <Input type="number" disabled={!editable} {...register("order", { valueAsNumber: true })} />
            </div>
            <div className="space-y-1">
              <Label>Certificate code</Label>
              <Input
                maxLength={2}
                disabled={!editable}
                {...register("code")}
                onChange={(e) => setValue("code", e.target.value.toUpperCase(), { shouldValidate: true })}
              />
              <p className="text-xs text-muted-foreground">
                2 uppercase letters, unique - required before this world can publish.
              </p>
              {formState.errors.code && (
                <p className="text-xs text-destructive">{formState.errors.code.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Theme (cosmetic accent color)</Label>
              <div className="flex items-center gap-2">
                <span
                  className="h-9 w-9 shrink-0 rounded-md border border-border"
                  style={{ backgroundColor: watch("theme") || "transparent" }}
                  aria-hidden
                />
                <Input disabled={!editable} {...register("theme")} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Display XP target (cosmetic only)</Label>
              <Input type="number" disabled={!editable} {...register("displayXpTarget", { valueAsNumber: true })} />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <div>
                <StatusBadge status={world.status}>{world.status}</StatusBadge>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Text" icon={Type}>
          <LocalizedFieldGroup label="Title" name="title" disabled={!titleTaglineEditable} warnings={warnings} />
          <LocalizedFieldGroup label="Tagline" name="tagline" disabled={!titleTaglineEditable} warnings={warnings} />
        </SectionCard>

        <ArtSection
          artUrl={world.artUrl}
          disabled={!(canEdit || canDelete)}
          publishedHint={!isDraft}
          onUpload={uploadArt}
          isPending={isPending}
        />

        <CardMediaSection
          cardMediaUrl={world.cardMediaUrl}
          disabled={!(canEdit || canDelete)}
          publishedHint={!isDraft}
          onUpload={uploadCardMedia}
          isPending={isPending}
        />

        <MentorRelationSection
          mentors={mentors}
          value={mentorId}
          onChange={(v) => setValue("mentorId", v, { shouldValidate: true })}
          disabled={!editable}
        />

        <StoredJsonPanel
          data={{
            id: world.id,
            order: world.order,
            code: world.code,
            status: world.status,
            theme: world.theme,
            displayXpTarget: world.displayXpTarget,
            mentorId: world.mentorId,
            title: world.title,
            tagline: world.tagline,
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
              if (!formState.isDirty || window.confirm("Discard unsaved changes to this world?")) {
                reset();
                router.push(`/admin/worlds/${world.id}`);
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

      <ConfirmDialog
        open={confirmMentorChange}
        onOpenChange={setConfirmMentorChange}
        title="Change this world's mentor?"
        description={
          <>
            Changing the mentor will leave {affectedDoubtZoneLessons.length} Doubt Zone lesson
            {affectedDoubtZoneLessons.length > 1 ? "s" : ""} scripted for the old mentor (
            {originalMentorKey}): {affectedDoubtZoneLessons.map((l) => l.title.en || l.id).join(", ")}.
            Review/update their scripts after saving.
          </>
        }
        confirmLabel="Save anyway"
        destructive={false}
        onConfirm={() => {
          setConfirmMentorChange(false);
          doSaveDraft(methods.getValues());
        }}
      />
    </FormProvider>
  );
}
