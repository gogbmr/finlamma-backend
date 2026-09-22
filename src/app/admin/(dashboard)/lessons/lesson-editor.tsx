"use client";

import { BookOpen } from "lucide-react";
import { useState, useTransition } from "react";
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
}: {
  worldId: string;
  worldMentorKey: string | null;
  lessons: LessonRow[];
  canManage: boolean;
  canPublish: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | "new" | null>(lessons[0]?.id ?? "new");

  if (lessons.length === 0 && !canManage) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No lessons in this world yet"
        description="A staff member with lesson.manage can create the first one."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Select value={selectedId ?? "new"} onValueChange={setSelectedId}>
        <SelectTrigger className="w-80">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {lessons.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              ch{l.chapter}/step{l.step} - {l.title.en || "(untitled)"} ({KIND_LABELS[l.kind]},{" "}
              {l.status})
            </SelectItem>
          ))}
          {canManage && <SelectItem value="new">+ New lesson</SelectItem>}
        </SelectContent>
      </Select>

      {selectedId === "new" && canManage ? (
        <NewLessonForm worldId={worldId} />
      ) : (
        (() => {
          const lesson = lessons.find((l) => l.id === selectedId);
          if (!lesson) return null;
          return (
            <LessonForm
              key={lesson.id}
              worldId={worldId}
              worldMentorKey={worldMentorKey}
              lesson={lesson}
              canManage={canManage}
              canPublish={canPublish}
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

function NewLessonForm({ worldId }: { worldId: string }) {
  const [isPending, startTransition] = useTransition();
  const [chapter, setChapter] = useState("");
  const [step, setStep] = useState("");
  const [kind, setKind] = useState<CreatableKind>("video");
  const [title, setTitle] = useState<LocalizedText>(EMPTY_LOCALIZED);
  const [blurb, setBlurb] = useState<LocalizedText>(EMPTY_LOCALIZED);
  const [contentText, setContentText] = useState(
    JSON.stringify(LESSON_CONTENT_TEMPLATES.video, null, 2),
  );

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
}: {
  worldId: string;
  worldMentorKey: string | null;
  lesson: LessonRow;
  canManage: boolean;
  canPublish: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [chapter, setChapter] = useState(String(lesson.chapter));
  const [step, setStep] = useState(String(lesson.step));
  const [title, setTitle] = useState<LocalizedText>(lesson.title);
  const [blurb, setBlurb] = useState<LocalizedText>(lesson.blurb);
  const [contentText, setContentText] = useState(JSON.stringify(lesson.content, null, 2));
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);

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
