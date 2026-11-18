"use client";

import { HelpCircle } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
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
  QUESTION_ANSWER_TEMPLATES,
  QUESTION_PAYLOAD_TEMPLATES,
  type QuestionFormat,
} from "@/server/questions/schemas";
import {
  createQuestionDraftAction,
  hotfixQuestionAction,
  loadQuestionDetailForAdminAction,
  publishQuestionAction,
  unpublishQuestionAction,
  updateQuestionDraftAction,
} from "./actions";
import { QuestionsTable } from "./questions-table";

export const FORMATS: QuestionFormat[] = [
  "single_select",
  "ordering",
  "sort_buckets",
  "fill_blank",
  "match_pairs",
  "spot_mistake",
  "number_guess",
];

export const FORMAT_LABELS: Record<QuestionFormat, string> = {
  single_select: "Single select",
  ordering: "Ordering",
  sort_buckets: "Sort into 2 buckets",
  fill_blank: "Fill in the blank",
  match_pairs: "Match pairs",
  spot_mistake: "Spot the mistake",
  number_guess: "Number guess (slider)",
};

// The full record, as QuestionForm needs it - loaded on demand per
// selection (see QuestionDetailLoader below), never all at once: the
// Questions list is now real-DB-paginated (Task 3b), so unlike the small
// catalogs (Task 3a) the full table is never sitting in memory.
type QuestionRow = {
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
// own sentinel - mapped back to/from null at the edges (onValueChange /
// the initial useState), never stored or sent to the server as a string.
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
const EMPTY_LOCALIZED: LocalizedText = { en: "", hi: "", hx: "" };

export function QuestionEditor({
  questions,
  topics,
  canManage,
  canPublish,
  total,
  page,
  pageCount,
  pageSize,
  q,
  sort,
  dir,
  format,
  status,
  topicId,
}: {
  questions: QuestionListRow[];
  topics: TopicOption[];
  canManage: boolean;
  canPublish: boolean;
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  q: string;
  sort: string;
  dir: "asc" | "desc";
  format: QuestionFormat | null;
  status: "draft" | "published" | null;
  topicId: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | "new" | null>(questions[0]?.id ?? "new");
  // Few-line confirm() guard, same pattern as every other entity table -
  // doesn't cover Prev/Next/search/sort/filters (plain <Link>s), deferred
  // to Task 4.
  const [isDirty, setIsDirty] = useState(false);

  function trySelect(id: string | "new") {
    if (
      isDirty &&
      typeof window !== "undefined" &&
      !window.confirm("Discard unsaved changes to this question?")
    ) {
      return;
    }
    setIsDirty(false);
    setSelectedId(id);
  }

  if (total === 0 && !canManage) {
    return (
      <EmptyState
        icon={HelpCircle}
        title="No questions yet"
        description="A staff member with question.manage can create the first one."
      />
    );
  }

  // `questions` is only the current page (it's now real-DB-paginated,
  // Task 3b) - a selection made on a page that's since changed under it
  // falls back to this page's first row.
  const effectiveId: string | "new" =
    selectedId === "new" || questions.some((qu) => qu.id === selectedId)
      ? (selectedId as string | "new")
      : questions[0]?.id ?? "new";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Select a question below to edit it.</p>
        {canManage && (
          <Button type="button" size="sm" onClick={() => trySelect("new")}>
            + New question
          </Button>
        )}
      </div>

      <QuestionsTable
        rows={questions}
        topics={topics}
        total={total}
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        q={q}
        sort={sort}
        dir={dir}
        format={format}
        status={status}
        topicId={topicId}
        selectedId={effectiveId}
        onSelect={trySelect}
      />

      {effectiveId === "new" && canManage ? (
        <NewQuestionForm topics={topics} onDirtyChange={setIsDirty} />
      ) : (
        questions.some((qu) => qu.id === effectiveId) && (
          <QuestionDetailLoader
            key={effectiveId}
            id={effectiveId}
            topics={topics}
            canManage={canManage}
            canPublish={canPublish}
            onDirtyChange={setIsDirty}
          />
        )
      )}
    </div>
  );
}

// Fetches a question's full record on demand (loadQuestionDetailForAdminAction)
// once it's selected - the admin list is now real-DB-paginated (Task 3b),
// so unlike the small catalogs the full record was never already in
// memory. Keyed by id in the parent so switching questions always starts a
// fresh fetch rather than reusing stale state.
function QuestionDetailLoader({
  id,
  topics,
  canManage,
  canPublish,
  onDirtyChange,
}: {
  id: string;
  topics: TopicOption[];
  canManage: boolean;
  canPublish: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; error: string }
    | { status: "ready"; question: QuestionRow }
  >({ status: "loading" });

  useEffect(() => {
    // No "reset to loading" call needed here: the parent keys this
    // component by id (see QuestionEditor's `key={effectiveId}`), so a
    // changed id always remounts a fresh instance - this effect only ever
    // runs once per mount, with state already starting at "loading".
    let cancelled = false;
    loadQuestionDetailForAdminAction({ id }).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setState({ status: "error", error: result.error });
        return;
      }
      setState({ status: "ready", question: result.data });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === "loading") {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Loading question…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {state.error}
      </div>
    );
  }
  return (
    <QuestionForm
      question={state.question}
      topics={topics}
      canManage={canManage}
      canPublish={canPublish}
      onDirtyChange={onDirtyChange}
    />
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

function parseJsonOrError(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function NewQuestionForm({
  topics,
  onDirtyChange,
}: {
  topics: TopicOption[];
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [format, setFormat] = useState<QuestionFormat>("single_select");
  const [topicId, setTopicId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<LocalizedText>(EMPTY_LOCALIZED);
  const [explanation, setExplanation] = useState<LocalizedText>(EMPTY_LOCALIZED);
  const [payloadText, setPayloadText] = useState(
    JSON.stringify(QUESTION_PAYLOAD_TEMPLATES.single_select, null, 2),
  );
  const [answerText, setAnswerText] = useState(
    JSON.stringify(QUESTION_ANSWER_TEMPLATES.single_select, null, 2),
  );

  // Derived from this form's own baseline for the current format (changing
  // format resets payload/answer text to that format's template too, and a
  // successful create resets everything back to this same baseline) - see
  // Worlds' NewWorldForm for why derived beats an effect-driven flag here.
  const dirty =
    topicId !== null ||
    LANGUAGES.some((l) => prompt[l] !== "") ||
    LANGUAGES.some((l) => explanation[l] !== "") ||
    payloadText !== JSON.stringify(QUESTION_PAYLOAD_TEMPLATES[format], null, 2) ||
    answerText !== JSON.stringify(QUESTION_ANSWER_TEMPLATES[format], null, 2);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  function changeFormat(newFormat: QuestionFormat) {
    setFormat(newFormat);
    setPayloadText(JSON.stringify(QUESTION_PAYLOAD_TEMPLATES[newFormat], null, 2));
    setAnswerText(JSON.stringify(QUESTION_ANSWER_TEMPLATES[newFormat], null, 2));
  }

  function create() {
    const payload = parseJsonOrError(payloadText);
    if (!payload.ok) {
      toast.error(payload.error);
      return;
    }
    const answer = parseJsonOrError(answerText);
    if (!answer.ok) {
      toast.error(answer.error);
      return;
    }
    startTransition(async () => {
      const result = await createQuestionDraftAction({
        format,
        topicId,
        prompt,
        explanation,
        payload: payload.value,
        answer: answer.value,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Question created as a draft");
      setTopicId(null);
      setPrompt(EMPTY_LOCALIZED);
      setExplanation(EMPTY_LOCALIZED);
      setPayloadText(JSON.stringify(QUESTION_PAYLOAD_TEMPLATES[format], null, 2));
      setAnswerText(JSON.stringify(QUESTION_ANSWER_TEMPLATES[format], null, 2));
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Format</Label>
          <Select value={format} onValueChange={(v) => changeFormat(v as QuestionFormat)}>
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
        </div>
        <div className="space-y-1">
          <Label>Topic (optional)</Label>
          <TopicSelect topics={topics} value={topicId} onChange={setTopicId} disabled={false} />
        </div>
      </div>

      <LocalizedFields label="Prompt" value={prompt} onChange={setPrompt} disabled={false} />
      <LocalizedFields label="Explanation" value={explanation} onChange={setExplanation} disabled={false} />

      <div className="space-y-1">
        <Label>Payload (JSON) - starter template pre-filled for this format</Label>
        <Textarea
          value={payloadText}
          onChange={(e) => setPayloadText(e.target.value)}
          className="min-h-40 font-mono text-xs"
        />
      </div>

      <div className="space-y-1">
        <Label>Answer (JSON) - language-independent, shared across en/hi/hx</Label>
        <Textarea
          value={answerText}
          onChange={(e) => setAnswerText(e.target.value)}
          className="min-h-20 font-mono text-xs"
        />
      </div>

      <Button type="button" onClick={create} disabled={isPending}>
        Create draft
      </Button>
    </div>
  );
}

function QuestionForm({
  question,
  topics,
  canManage,
  canPublish,
  onDirtyChange,
}: {
  question: QuestionRow;
  topics: TopicOption[];
  canManage: boolean;
  canPublish: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [topicId, setTopicId] = useState<string | null>(question.topicId);
  const [prompt, setPrompt] = useState<LocalizedText>(question.prompt);
  const [explanation, setExplanation] = useState<LocalizedText>(question.explanation);
  const [payloadText, setPayloadText] = useState(JSON.stringify(question.payload, null, 2));
  const [answerText, setAnswerText] = useState(JSON.stringify(question.answer, null, 2));

  // The "pristine" baseline, moved forward after each successful save -
  // see Worlds' WorldForm for why comparing against the `question` prop
  // directly would false-positive "still dirty" right after a save.
  const [savedSnapshot, setSavedSnapshot] = useState({
    topicId: question.topicId,
    prompt: question.prompt,
    explanation: question.explanation,
    payloadText: JSON.stringify(question.payload, null, 2),
    answerText: JSON.stringify(question.answer, null, 2),
  });

  const dirty =
    topicId !== savedSnapshot.topicId ||
    LANGUAGES.some((l) => prompt[l] !== savedSnapshot.prompt[l]) ||
    LANGUAGES.some((l) => explanation[l] !== savedSnapshot.explanation[l]) ||
    payloadText !== savedSnapshot.payloadText ||
    answerText !== savedSnapshot.answerText;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const isDraft = question.status === "draft";
  const editable = canManage && isDraft;
  // D20 (docs/ARCHITECTURE.md): a published question's prompt/explanation/
  // payload/answer can still be hotfixed directly (typo, or a wrong correct
  // answer) - requires question.publish, the same trust bar as publishing.
  // `topic` stays draft-only (not part of what a hotfix is for).
  const hotfixable = canPublish && !isDraft;
  const contentEditable = editable || hotfixable;

  function saveDraft() {
    const payload = parseJsonOrError(payloadText);
    if (!payload.ok) {
      toast.error(payload.error);
      return;
    }
    const answer = parseJsonOrError(answerText);
    if (!answer.ok) {
      toast.error(answer.error);
      return;
    }
    startTransition(async () => {
      const result = await updateQuestionDraftAction({
        id: question.id,
        topicId,
        prompt,
        explanation,
        payload: payload.value,
        answer: answer.value,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Draft saved");
      setSavedSnapshot({ topicId, prompt, explanation, payloadText, answerText });
    });
  }

  function saveHotfix() {
    const payload = parseJsonOrError(payloadText);
    if (!payload.ok) {
      toast.error(payload.error);
      return;
    }
    const answer = parseJsonOrError(answerText);
    if (!answer.ok) {
      toast.error(answer.error);
      return;
    }
    startTransition(async () => {
      const result = await hotfixQuestionAction({
        id: question.id,
        prompt,
        explanation,
        payload: payload.value,
        answer: answer.value,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Fix saved - live immediately");
      setSavedSnapshot((prev) => ({ ...prev, prompt, explanation, payloadText, answerText }));
    });
  }

  function publish() {
    startTransition(async () => {
      const result = await publishQuestionAction({ id: question.id });
      if (!result.ok) {
        toast.error(result.error);
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
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <StatusBadge status={question.status}>{question.status}</StatusBadge>
        <span>Format: {FORMAT_LABELS[question.format]} (fixed, can&apos;t change after creation)</span>
        {!isDraft && (
          <span className="text-xs text-muted-foreground">
            Published - prompt/explanation/payload/answer can be fixed directly below. Topic needs
            unpublish first.
          </span>
        )}
      </div>

      <div className="space-y-1">
        <Label>Topic (optional)</Label>
        <TopicSelect topics={topics} value={topicId} onChange={setTopicId} disabled={!editable} />
      </div>

      <LocalizedFields label="Prompt" value={prompt} onChange={setPrompt} disabled={!contentEditable} />
      <LocalizedFields
        label="Explanation"
        value={explanation}
        onChange={setExplanation}
        disabled={!contentEditable}
      />

      <div className="space-y-1">
        <Label>Payload (JSON)</Label>
        <Textarea
          value={payloadText}
          disabled={!contentEditable}
          onChange={(e) => setPayloadText(e.target.value)}
          className="min-h-40 font-mono text-xs"
        />
      </div>

      <div className="space-y-1">
        <Label>Answer (JSON) - language-independent</Label>
        <Textarea
          value={answerText}
          disabled={!contentEditable}
          onChange={(e) => setAnswerText(e.target.value)}
          className="min-h-20 font-mono text-xs"
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
        {canPublish && !isDraft && (
          <Button type="button" variant="outline" onClick={unpublish} disabled={isPending}>
            Unpublish
          </Button>
        )}
      </div>
    </div>
  );
}
