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
import { createAboutMeChipAction, deleteAboutMeChipAction, updateAboutMeChipAction } from "./actions";

type ChipRow = { id: string; name: LocalizedText; iconKey: string | null; active: boolean };

function NameInputs({ name, onChange }: { name: LocalizedText; onChange: (name: LocalizedText) => void }) {
  return (
    <div className="flex gap-2">
      <Input placeholder="English" className="w-28" value={name.en} onChange={(e) => onChange({ ...name, en: e.target.value })} />
      <Input placeholder="Hindi" className="w-28" value={name.hi} onChange={(e) => onChange({ ...name, hi: e.target.value })} />
      <Input placeholder="Hinglish" className="w-28" value={name.hx} onChange={(e) => onChange({ ...name, hx: e.target.value })} />
    </div>
  );
}

function rowError(name: LocalizedText): string | null {
  if (!name.en.trim() || !name.hi.trim() || !name.hx.trim()) return "All three languages are required";
  return null;
}

function ChipRowEditor({ chip }: { chip: ChipRow }) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: chip.name, iconKey: chip.iconKey ?? "", active: chip.active });
  const [deleteOpen, setDeleteOpen] = useState(false);

  const error = rowError(form.name);

  function save() {
    startTransition(async () => {
      const result = await updateAboutMeChipAction(chip.id, { ...form, iconKey: form.iconKey || null });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Chip saved");
    });
  }

  function confirmDelete() {
    setDeleteOpen(false);
    startTransition(async () => {
      const result = await deleteAboutMeChipAction(chip.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Chip deleted");
    });
  }

  return (
    <>
      <TableRow>
        <TableCell>
          <NameInputs name={form.name} onChange={(name) => setForm({ ...form, name })} />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </TableCell>
        <TableCell>
          <Input
            placeholder="icon-key"
            className="w-32"
            value={form.iconKey}
            onChange={(e) => setForm({ ...form, iconKey: e.target.value })}
          />
        </TableCell>
        <TableCell>
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
        </TableCell>
        <TableCell className="space-x-2">
          <Button type="button" size="sm" onClick={save} disabled={isPending || error !== null}>
            Save
          </Button>
          <Button type="button" size="sm" variant="destructive" onClick={() => setDeleteOpen(true)} disabled={isPending}>
            Delete
          </Button>
        </TableCell>
      </TableRow>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chip?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{chip.name.en}&quot; will be removed from the catalog. This fails if any learner
              currently has it selected - turn it off (inactive) instead if you just want to retire it.
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

const BLANK_NAME: LocalizedText = { en: "", hi: "", hx: "" };

function NewChipRow() {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: BLANK_NAME, iconKey: "", active: true });

  const error = rowError(form.name);

  function create() {
    startTransition(async () => {
      const result = await createAboutMeChipAction({ ...form, iconKey: form.iconKey || null });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Chip added");
      setForm({ name: BLANK_NAME, iconKey: "", active: true });
    });
  }

  return (
    <TableRow>
      <TableCell>
        <NameInputs name={form.name} onChange={(name) => setForm({ ...form, name })} />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </TableCell>
      <TableCell>
        <Input
          placeholder="icon-key"
          className="w-32"
          value={form.iconKey}
          onChange={(e) => setForm({ ...form, iconKey: e.target.value })}
        />
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

export function AboutMeChipsEditor({ chips }: { chips: ChipRow[] }) {
  return (
    <div className="max-w-3xl space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">About-me chips (Arena, AR-20)</h2>
        <p className="text-xs text-muted-foreground">
          The preset chips a learner can pick for their public Arena profile - never free text
          (docs/ARCHITECTURE.md D36). A learner picks at most 3. Turning a chip inactive hides it
          from the picker without removing it from anyone who already selected it.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name (en / hi / hx)</TableHead>
            <TableHead>Icon key</TableHead>
            <TableHead>Active</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {chips.map((chip) => (
            <ChipRowEditor key={chip.id} chip={chip} />
          ))}
          <NewChipRow />
        </TableBody>
      </Table>
    </div>
  );
}
