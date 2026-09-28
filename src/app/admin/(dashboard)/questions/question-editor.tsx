"use client";

import { HelpCircle } from "lucide-react";
import { useState, useTransition } from "react";
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
  publishQuestionAction,
  unpublishQuestionAction,
  updateQuestionDraftAction,
} from "./actions";

const FORMATS: QuestionFormat[] = [
  "single_select",
  "ordering",
  "sort_buckets",
  "fill_blank",
  "match_pairs",
  "spot_mistake",
  "number_guess",
];

const FORMAT_LABELS: Record<QuestionFormat, string> = {
  single_select: "Single select",
  ordering: "Ordering",
  sort_buckets: "Sort into 2 buckets",
  fill_blank: "Fill in the blank",
  match_pairs: "Match pairs",
  spot_mistake: "Spot the mistake",
  number_guess: "Number guess (slider)",
};

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
}: {
  questions: QuestionRow[];
  topics: TopicOption[];
  canManage: boolean;
  canPublish: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | "new" | null>(questions[0]?.id ?? "new");

  if (questions.length === 0 && !canManage) {
    return (
      <EmptyState
        icon={HelpCircle}
        title="No questions yet"
        description="A staff member with question.manage can create the first one."
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
          {questions.map((q) => (
            <SelectItem key={q.id} value={q.id}>
              {q.prompt.en || "(untitled)"} ({FORMAT_LABELS[q.format]}, {q.status})
            </SelectItem>
          ))}
          {canManage && <SelectItem value="new">+ New question</SelectItem>}
        </SelectContent>
      </Select>

      {selectedId === "new" && canManage ? (
        <NewQuestionForm topics={topics} />
      ) : (
        (() => {
          const question = questions.find((q) => q.id === selectedId);
          if (!question) return null;
          return (
            <QuestionForm
              key={question.id}
              question={question}
              topics={topics}
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

function parseJsonOrError(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function NewQuestionForm({ topics }: { topics: TopicOption[] }) {
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
}: {
  question: QuestionRow;
  topics: TopicOption[];
  canManage: boolean;
  canPublish: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [topicId, setTopicId] = useState<string | null>(question.topicId);
  const [prompt, setPrompt] = useState<LocalizedText>(question.prompt);
  const [explanation, setExplanation] = useState<LocalizedText>(question.explanation);
  const [payloadText, setPayloadText] = useState(JSON.stringify(question.payload, null, 2));
  const [answerText, setAnswerText] = useState(JSON.stringify(question.answer, null, 2));

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
