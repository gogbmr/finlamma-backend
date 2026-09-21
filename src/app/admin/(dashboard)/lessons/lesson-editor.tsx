"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
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
  publishLessonAction,
  unpublishLessonAction,
  updateLessonDraftAction,
} from "./actions";

const CREATABLE_KINDS = ["video", "story", "quiz", "boss_quiz", "role_play"] as const;
type CreatableKind = (typeof CREATABLE_KINDS)[number];

const KIND_LABELS: Record<string, string> = {
  video: "Video",
  story: "Story",
  quiz: "Quiz",
  boss_quiz: "Boss Quiz",
  role_play: "Role Play",
  doubt_zone: "Doubt Zone (Checkpoint 4b)",
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
};

const LANGUAGES = ["en", "hi", "hx"] as const;
const EMPTY_LOCALIZED: LocalizedText = { en: "", hi: "", hx: "" };

export function LessonEditor({
  worldId,
  lessons,
  canManage,
  canPublish,
}: {
  worldId: string;
  lessons: LessonRow[];
  canManage: boolean;
  canPublish: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | "new" | null>(lessons[0]?.id ?? "new");

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
      <p className="text-sm font-medium text-neutral-800">{label}</p>
      {LANGUAGES.map((lang) => (
        <div key={lang} className="space-y-1">
          <label className="text-xs font-medium uppercase text-neutral-500">{lang}</label>
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
    <div className="space-y-4 rounded-lg border border-neutral-200 p-4">
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
  lesson,
  canManage,
  canPublish,
}: {
  worldId: string;
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

  const isDraft = lesson.status === "draft";
  const editable = canManage && isDraft;

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
    startTransition(async () => {
      const result = await unpublishLessonAction({ id: lesson.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Unpublished - back to draft");
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
        <span
          className={
            lesson.status === "published"
              ? "rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
              : "rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
          }
        >
          {lesson.status}
        </span>
        <span>Kind: {KIND_LABELS[lesson.kind] ?? lesson.kind} (fixed, can&apos;t change after creation)</span>
        {!isDraft && (
          <span className="text-xs text-neutral-500">
            Published lessons can&apos;t be edited - unpublish first.
          </span>
        )}
      </div>

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

      <LocalizedFields label="Title" value={title} onChange={setTitle} disabled={!editable} />
      <LocalizedFields label="Blurb" value={blurb} onChange={setBlurb} disabled={!editable} />

      <div className="space-y-1">
        <Label>Content (JSON)</Label>
        <Textarea
          value={contentText}
          disabled={!editable}
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
      </div>
    </div>
  );
}
