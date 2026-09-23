"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LocalizedText } from "@/server/shared/schemas";
import { createRankTitleAction, deleteRankTitleAction, updateRankTitleAction } from "./actions";

type RankTitleRow = { id: string; minLevel: number; title: LocalizedText };

function TitleInputs({
  title,
  onChange,
}: {
  title: LocalizedText;
  onChange: (title: LocalizedText) => void;
}) {
  return (
    <div className="flex gap-2">
      <Input
        placeholder="English"
        className="w-28"
        value={title.en}
        onChange={(e) => onChange({ ...title, en: e.target.value })}
      />
      <Input
        placeholder="Hindi"
        className="w-28"
        value={title.hi}
        onChange={(e) => onChange({ ...title, hi: e.target.value })}
      />
      <Input
        placeholder="Hinglish"
        className="w-28"
        value={title.hx}
        onChange={(e) => onChange({ ...title, hx: e.target.value })}
      />
    </div>
  );
}

function rowError(minLevel: number, title: LocalizedText): string | null {
  if (!Number.isInteger(minLevel) || minLevel < 1) return "Min level must be a whole number, 1 or more";
  if (!title.en.trim() || !title.hi.trim() || !title.hx.trim()) return "All three languages are required";
  return null;
}

function RankTitleRowEditor({ rank }: { rank: RankTitleRow }) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ minLevel: rank.minLevel, title: rank.title });
  const [deleteOpen, setDeleteOpen] = useState(false);

  const error = rowError(form.minLevel, form.title);

  function save() {
    startTransition(async () => {
      const result = await updateRankTitleAction(rank.id, form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Rank title saved");
    });
  }

  function confirmDelete() {
    setDeleteOpen(false);
    startTransition(async () => {
      const result = await deleteRankTitleAction(rank.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Rank title deleted");
    });
  }

  return (
    <>
      <TableRow>
        <TableCell>
          <Input
            type="number"
            className="w-20"
            value={form.minLevel}
            onChange={(e) => setForm({ ...form, minLevel: Number(e.target.value) })}
          />
        </TableCell>
        <TableCell>
          <TitleInputs title={form.title} onChange={(title) => setForm({ ...form, title })} />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </TableCell>
        <TableCell className="space-x-2">
          <Button type="button" size="sm" onClick={save} disabled={isPending || error !== null}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
            disabled={isPending}
          >
            Delete
          </Button>
        </TableCell>
      </TableRow>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rank title?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{rank.title.en}&quot; (min level {rank.minLevel}) will no longer be shown to any
              learner. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const BLANK_TITLE: LocalizedText = { en: "", hi: "", hx: "" };

function NewRankTitleRow() {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ minLevel: 1, title: BLANK_TITLE });

  const error = rowError(form.minLevel, form.title);

  function create() {
    startTransition(async () => {
      const result = await createRankTitleAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Rank title added");
      setForm({ minLevel: 1, title: BLANK_TITLE });
    });
  }

  return (
    <TableRow>
      <TableCell>
        <Input
          type="number"
          className="w-20"
          value={form.minLevel}
          onChange={(e) => setForm({ ...form, minLevel: Number(e.target.value) })}
        />
      </TableCell>
      <TableCell>
        <TitleInputs title={form.title} onChange={(title) => setForm({ ...form, title })} />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </TableCell>
      <TableCell>
        <Button type="button" size="sm" onClick={create} disabled={isPending || error !== null}>
          Add
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function RankTitlesEditor({ rankTitles }: { rankTitles: RankTitleRow[] }) {
  return (
    <div className="max-w-3xl space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">Rank titles</h2>
        <p className="text-xs text-muted-foreground">
          Shown on a learner&apos;s Profile Overview (level ring): the title with the highest min
          level that&apos;s still at or below their current level. A learner below every min level
          here simply shows no rank title.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Min level</TableHead>
            <TableHead>Title (en / hi / hx)</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rankTitles.map((rank) => (
            <RankTitleRowEditor key={rank.id} rank={rank} />
          ))}
          <NewRankTitleRow />
        </TableBody>
      </Table>
    </div>
  );
}
