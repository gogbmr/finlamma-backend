"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LocalizedText } from "@/server/shared/schemas";
import { createTopicAction, updateTopicAction } from "./actions";

type TopicRow = { id: string; order: number; name: LocalizedText; active: boolean };

function NameInputs({ name, onChange }: { name: LocalizedText; onChange: (name: LocalizedText) => void }) {
  return (
    <div className="flex gap-2">
      <Input
        placeholder="English"
        className="w-32"
        value={name.en}
        onChange={(e) => onChange({ ...name, en: e.target.value })}
      />
      <Input
        placeholder="Hindi"
        className="w-32"
        value={name.hi}
        onChange={(e) => onChange({ ...name, hi: e.target.value })}
      />
      <Input
        placeholder="Hinglish"
        className="w-32"
        value={name.hx}
        onChange={(e) => onChange({ ...name, hx: e.target.value })}
      />
    </div>
  );
}

function rowError(order: number, name: LocalizedText): string | null {
  if (!Number.isInteger(order) || order < 1) return "Order must be a whole number, 1 or more";
  if (!name.en.trim() || !name.hi.trim() || !name.hx.trim()) return "All three languages are required";
  return null;
}

// No delete - a topic can be referenced by questions.topicId/
// news_stories.topicId (onDelete: set null), and quietly nulling out a live
// question or story's topic from an admin list screen is a worse surprise
// than just leaving "active" as the only off switch, same reasoning
// rank_titles' harder delete doesn't have to weigh (nothing references a
// rank title by id).
function TopicRowEditor({ topic }: { topic: TopicRow }) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ order: topic.order, name: topic.name, active: topic.active });

  const error = rowError(form.order, form.name);

  function save() {
    startTransition(async () => {
      const result = await updateTopicAction(topic.id, form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Topic saved");
    });
  }

  return (
    <TableRow>
      <TableCell>
        <Input
          type="number"
          className="w-20"
          value={form.order}
          onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
        />
      </TableCell>
      <TableCell>
        <NameInputs name={form.name} onChange={(name) => setForm({ ...form, name })} />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </TableCell>
      <TableCell>
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
        />
      </TableCell>
      <TableCell>
        <Button type="button" size="sm" onClick={save} disabled={isPending || error !== null}>
          Save
        </Button>
      </TableCell>
    </TableRow>
  );
}

const BLANK_NAME: LocalizedText = { en: "", hi: "", hx: "" };

function NewTopicRow({ nextOrder }: { nextOrder: number }) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ order: nextOrder, name: BLANK_NAME, active: true });

  const error = rowError(form.order, form.name);

  function create() {
    startTransition(async () => {
      const result = await createTopicAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Topic added");
      setForm({ order: nextOrder + 1, name: BLANK_NAME, active: true });
    });
  }

  return (
    <TableRow>
      <TableCell>
        <Input
          type="number"
          className="w-20"
          value={form.order}
          onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
        />
      </TableCell>
      <TableCell>
        <NameInputs name={form.name} onChange={(name) => setForm({ ...form, name })} />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </TableCell>
      <TableCell>
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
        />
      </TableCell>
      <TableCell>
        <Button type="button" size="sm" onClick={create} disabled={isPending || error !== null}>
          Add
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function TopicsEditor({ topics }: { topics: TopicRow[] }) {
  const nextOrder = topics.reduce((max, t) => Math.max(max, t.order), 0) + 1;
  return (
    <div className="max-w-3xl space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">Topics</h2>
        <p className="text-xs text-muted-foreground">
          The shared taxonomy behind a question&apos;s mastery-bar topic and a news story&apos;s
          Pulse-Check topic tag. Not the same as News category filter chips (RBI, Stocks, Global,
          ...), which are a separate, coarser feed-navigation list. Deactivate instead of deleting -
          questions and stories already tagged with a topic keep that tag even if it&apos;s hidden
          from new pickers.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Name (en / hi / hx)</TableHead>
            <TableHead>Active</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {topics.map((topic) => (
            <TopicRowEditor key={topic.id} topic={topic} />
          ))}
          <NewTopicRow nextOrder={nextOrder} />
        </TableBody>
      </Table>
    </div>
  );
}
