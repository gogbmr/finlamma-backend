"use client";

import { BookOpen } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { EmptyState } from "@/components/admin/empty-state";
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
import type { LocalizedText } from "@/server/shared/schemas";
import { LESSON_CONTENT_TEMPLATES } from "@/server/lessons/schemas";
import {
  createLessonDraftAction,
  hotfixLessonAction,
  previewLessonAction,
  publishLessonAction,
  unpublishLessonAction,
  updateLessonDraftAction,
} from "./actions";
import { LessonPreview } from "./lesson-preview";
import { LessonsTable } from "./lessons-table";

type PreviewData = Extract<Awaited<ReturnType<typeof previewLessonAction>>, { ok: true }>["data"];

const CREATABLE_KINDS = [
  "video",
  "story",
  "quiz",
  "boss_quiz",
  "role_play",
  "doubt_zone",
] as const;
type CreatableKind = (typeof CREATABLE_KINDS)[number];

const KIND_LABELS: Record<string, string> = {
  video: "Video",
  story: "Story",
  quiz: "Quiz",
  boss_quiz: "Boss Quiz",
  role_play: "Role Play",
  doubt_zone: "Doubt Zone",
};

type LessonRow = {
  id: string;
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
const EMPTY_LOCALIZED: LocalizedText = { en: "", hi: "", hx: "" };

export function LessonEditor({
  worldId,
  worldMentorKey,
  lessons,
  canManage,
  canPublish,
  total,
  page,
  pageCount,
  pageSize,
  q,
  sort,
  dir,
  kind,
  status,
}: {
  worldId: string;
  worldMentorKey: string | null;
  lessons: LessonRow[];
  canManage: boolean;
  canPublish: boolean;
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  q: string;
  sort: string | null;
  dir: "asc" | "desc";
  kind: string | null;
  status: "draft" | "published" | null;
}) {
  const [selectedId, setSelectedId] = useState<string | "new" | null>(lessons[0]?.id ?? "new");
  // Few-line confirm() guard, same pattern as every other entity table -
  // doesn't cover Prev/Next/search/sort/kind/status (plain <Link>s),
  // deferred to Task 4.
  const [isDirty, setIsDirty] = useState(false);

  function trySelect(id: string | "new") {
    if (
      isDirty &&
      typeof window !== "undefined" &&
      !window.confirm("Discard unsaved changes to this lesson?")
    ) {
      return;
    }
    setIsDirty(false);
    setSelectedId(id);
  }

  if (total === 0 && !canManage) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No lessons in this world yet"
        description="A staff member with lesson.manage can create the first one."
      />
    );
  }

  // `lessons` is only the current page - a selection made on a page that's
  // since changed under it falls back to this page's first row.
  const effectiveId: string | "new" =
    selectedId === "new" || lessons.some((l) => l.id === selectedId)
      ? (selectedId as string | "new")
      : lessons[0]?.id ?? "new";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Select a lesson below to edit it.</p>
        {canManage && (
          <Button type="button" size="sm" onClick={() => trySelect("new")}>
            + New lesson
          </Button>
        )}
      </div>

      <LessonsTable
        worldId={worldId}
        rows={lessons.map((l) => ({
          id: l.id,
          chapter: l.chapter,
          step: l.step,
          kind: l.kind,
          title: l.title,
          status: l.status,
        }))}
        total={total}
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        q={q}
        sort={sort}
        dir={dir}
        kind={kind}
        status={status}
        selectedId={effectiveId}
        onSelect={trySelect}
      />

      {effectiveId === "new" && canManage ? (
        <NewLessonForm worldId={worldId} onDirtyChange={setIsDirty} />
      ) : (
        (() => {
          const lesson = lessons.find((l) => l.id === effectiveId);
          if (!lesson) return null;
          return (
            <LessonForm
              key={lesson.id}
              worldId={worldId}
              worldMentorKey={worldMentorKey}
              lesson={lesson}
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
          <Textarea
            value={value[lang]}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
          />
        </div>
      ))}
    </div>
  );
}

// Parses the content textarea's JSON, turning a syntax error into the same
// human-readable ActionResult shape a server-side validation failure
// produces, so the caller only has one error path to handle.
function parseContentOrError(raw: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: "Content must be a JSON object" };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function NewLessonForm({
  worldId,
  onDirtyChange,
}: {
  worldId: string;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [chapter, setChapter] = useState("");
  const [step, setStep] = useState("");
  const [kind, setKind] = useState<CreatableKind>("video");
  const [title, setTitle] = useState<LocalizedText>(EMPTY_LOCALIZED);
  const [blurb, setBlurb] = useState<LocalizedText>(EMPTY_LOCALIZED);
  const [contentText, setContentText] = useState(
    JSON.stringify(LESSON_CONTENT_TEMPLATES.video, null, 2),
  );

  // Derived from this form's own empty baseline - contentText's baseline is
  // the current kind's template (changeKind resets it there too), not "",
  // so this stays clean right after a kind switch and right after a
  // successful create resets everything back to this same baseline. See
  // Worlds' NewWorldForm for why derived beats an effect-driven flag here.
  const dirty =
    chapter !== "" ||
    step !== "" ||
    LANGUAGES.some((l) => title[l] !== "") ||
    LANGUAGES.some((l) => blurb[l] !== "") ||
    contentText !== JSON.stringify(LESSON_CONTENT_TEMPLATES[kind], null, 2);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  function changeKind(newKind: CreatableKind) {
    setKind(newKind);
    setContentText(JSON.stringify(LESSON_CONTENT_TEMPLATES[newKind], null, 2));
  }

  function create() {
    const parsed = parseContentOrError(contentText);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    startTransition(async () => {
      const result = await createLessonDraftAction({
        worldId,
        chapter: Number(chapter),
        step: Number(step),
        kind,
        title,
        blurb,
        content: parsed.value,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Lesson created as a draft");
      setChapter("");
      setStep("");
      setTitle(EMPTY_LOCALIZED);
      setBlurb(EMPTY_LOCALIZED);
      setContentText(JSON.stringify(LESSON_CONTENT_TEMPLATES[kind], null, 2));
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>Chapter (1-8)</Label>
          <Input type="number" min={1} max={8} value={chapter} onChange={(e) => setChapter(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Step (1-5)</Label>
          <Input type="number" min={1} max={5} value={step} onChange={(e) => setStep(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Kind</Label>
          <Select value={kind} onValueChange={(v) => changeKind(v as CreatableKind)}>
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
        </div>
      </div>

      <LocalizedFields label="Title" value={title} onChange={setTitle} disabled={false} />
      <LocalizedFields label="Blurb" value={blurb} onChange={setBlurb} disabled={false} />

      <div className="space-y-1">
        <Label>Content (JSON) - starter template pre-filled for this kind</Label>
        <Textarea
          value={contentText}
          onChange={(e) => setContentText(e.target.value)}
          className="min-h-64 font-mono text-xs"
        />
      </div>

      <Button type="button" onClick={create} disabled={isPending || !chapter || !step}>
        Create draft
      </Button>
    </div>
  );
}

function LessonForm({
  worldId,
  worldMentorKey,
  lesson,
  canManage,
  canPublish,
  onDirtyChange,
}: {
  worldId: string;
  worldMentorKey: string | null;
  lesson: LessonRow;
  canManage: boolean;
  canPublish: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [chapter, setChapter] = useState(String(lesson.chapter));
  const [step, setStep] = useState(String(lesson.step));
  const [title, setTitle] = useState<LocalizedText>(lesson.title);
  const [blurb, setBlurb] = useState<LocalizedText>(lesson.blurb);
  const [contentText, setContentText] = useState(JSON.stringify(lesson.content, null, 2));
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);

  // The "pristine" baseline, moved forward after each successful save -
  // see Worlds' WorldForm for why comparing against the `lesson` prop
  // directly would false-positive "still dirty" right after a save.
  const [savedSnapshot, setSavedSnapshot] = useState({
    chapter: String(lesson.chapter),
    step: String(lesson.step),
    title: lesson.title,
    blurb: lesson.blurb,
    contentText: JSON.stringify(lesson.content, null, 2),
  });

  const dirty =
    chapter !== savedSnapshot.chapter ||
    step !== savedSnapshot.step ||
    LANGUAGES.some((l) => title[l] !== savedSnapshot.title[l]) ||
    LANGUAGES.some((l) => blurb[l] !== savedSnapshot.blurb[l]) ||
    contentText !== savedSnapshot.contentText;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const isDraft = lesson.status === "draft";
  const editable = canManage && isDraft;
  // D20/D23 (docs/ARCHITECTURE.md): a published lesson's title/blurb/content
  // can still be hotfixed directly - requires lesson.publish, the same
  // trust bar as publishing. The ONLY fix path for a boss_quiz lesson,
  // since unpublishing one is hard-blocked below.
  const hotfixable = canPublish && !isDraft;
  const contentEditable = editable || hotfixable;
  const isBossQuiz = lesson.kind === "boss_quiz";

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

  function saveDraft() {
    const parsed = parseContentOrError(contentText);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    startTransition(async () => {
      const result = await updateLessonDraftAction({
        id: lesson.id,
        worldId,
        chapter: Number(chapter),
        step: Number(step),
        title,
        blurb,
        content: parsed.value,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Draft saved");
      setSavedSnapshot({ chapter, step, title, blurb, contentText });
    });
  }

  function publish() {
    startTransition(async () => {
      const result = await publishLessonAction({ id: lesson.id });
      if (!result.ok) {
        toast.error(result.error);
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

  function saveHotfix() {
    const parsed = parseContentOrError(contentText);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    startTransition(async () => {
      const result = await hotfixLessonAction({ id: lesson.id, title, blurb, content: parsed.value });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Fix saved - live immediately");
      setSavedSnapshot((prev) => ({ ...prev, title, blurb, contentText }));
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
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      {mentorMismatch && (
        <div className="rounded-md border border-status-draft-fg/30 bg-status-draft-bg p-3 text-sm text-status-draft-fg">
          This Doubt Zone script was written for mentor &quot;{scriptedMentorKey}&quot;, but this
          world&apos;s current mentor is &quot;{worldMentorKey}&quot;. Review the script before
          publishing.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <StatusBadge status={lesson.status}>{lesson.status}</StatusBadge>
        <span>Kind: {KIND_LABELS[lesson.kind] ?? lesson.kind} (fixed, can&apos;t change after creation)</span>
        {!isDraft && (
          <span className="text-xs text-muted-foreground">
            Published - title/blurb/content can be fixed directly below. Chapter/step need
            unpublish first.
          </span>
        )}
        {!isDraft && lesson.inProgressLearnerCount > 0 && (
          <Badge variant="info">
            {lesson.inProgressLearnerCount} learner{lesson.inProgressLearnerCount > 1 ? "s" : ""} mid-lesson
          </Badge>
        )}
      </div>

      {isBossQuiz && !isDraft && (
        <div className="rounded-md border border-status-draft-fg/30 bg-status-draft-bg p-3 text-sm text-status-draft-fg">
          This is a world&apos;s Boss Quiz - it can never be unpublished (it gates every later
          world&apos;s unlock). Use &quot;Save fix&quot; to correct it instead.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Chapter (1-8)</Label>
          <Input
            type="number"
            min={1}
            max={8}
            value={chapter}
            disabled={!editable}
            onChange={(e) => setChapter(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Step (1-5)</Label>
          <Input
            type="number"
            min={1}
            max={5}
            value={step}
            disabled={!editable}
            onChange={(e) => setStep(e.target.value)}
          />
        </div>
      </div>

      <LocalizedFields label="Title" value={title} onChange={setTitle} disabled={!contentEditable} />
      <LocalizedFields label="Blurb" value={blurb} onChange={setBlurb} disabled={!contentEditable} />

      <div className="space-y-1">
        <Label>Content (JSON)</Label>
        <Textarea
          value={contentText}
          disabled={!contentEditable}
          onChange={(e) => setContentText(e.target.value)}
          className="min-h-64 font-mono text-xs"
        />
      </div>

      <div className="flex gap-2">
        {editable && (
          <Button type="button" variant="outline" onClick={saveDraft} disabled={isPending}>
            Save draft
          </Button>
        )}
        {hotfixable && (
          <Button type="button" variant="outline" onClick={saveHotfix} disabled={isPending}>
            Save fix
          </Button>
        )}
        {canPublish && isDraft && (
          <Button type="button" onClick={publish} disabled={isPending}>
            Publish
          </Button>
        )}
        {canPublish && !isDraft && !isBossQuiz && (
          <Button type="button" variant="outline" onClick={unpublish} disabled={isPending}>
            Unpublish
          </Button>
        )}
        <Button type="button" variant="outline" onClick={openPreview} disabled={isPending}>
          Preview
        </Button>
      </div>

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
    </div>
  );
}
