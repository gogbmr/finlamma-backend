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
import { createPeerHandleAction, deletePeerHandleAction, updatePeerHandleAction } from "./actions";

type PeerHandleRow = { id: string; key: string; name: LocalizedText; active: boolean };

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

function PeerHandleRowEditor({ handle }: { handle: PeerHandleRow }) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: handle.name, active: handle.active });
  const [deleteOpen, setDeleteOpen] = useState(false);

  const error = rowError(form.name);

  function save() {
    startTransition(async () => {
      const result = await updatePeerHandleAction(handle.id, form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Handle saved");
    });
  }

  function confirmDelete() {
    setDeleteOpen(false);
    startTransition(async () => {
      const result = await deletePeerHandleAction(handle.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Handle deleted");
    });
  }

  return (
    <>
      <TableRow>
        <TableCell className="font-mono text-xs text-muted-foreground">{handle.key}</TableCell>
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
            <AlertDialogTitle>Delete this handle?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{handle.name.en}&quot; will be removed from the catalog. This fails if any
              learner is currently assigned it - turn it off (inactive) instead if you just want
              to retire it.
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

function NewPeerHandleRow() {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ key: "", name: BLANK_NAME, active: true });

  const nameInvalid = rowError(form.name);
  const keyInvalid = !/^[a-z0-9-]+$/.test(form.key) ? "Lowercase letters, numbers and hyphens only" : null;
  const error = nameInvalid ?? keyInvalid;

  function create() {
    startTransition(async () => {
      const result = await createPeerHandleAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Handle added");
      setForm({ key: "", name: BLANK_NAME, active: true });
    });
  }

  return (
    <TableRow>
      <TableCell>
        <Input
          placeholder="smart-saver"
          className="w-32 font-mono text-xs"
          value={form.key}
          onChange={(e) => setForm({ ...form, key: e.target.value })}
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
        <Button type="button" size="sm" onClick={create} disabled={isPending || error !== null || !form.key}>
          Add
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function PeerHandlesEditor({ handles }: { handles: PeerHandleRow[] }) {
  return (
    <div className="max-w-3xl space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">Peer-visible handles (D73)</h2>
        <p className="text-xs text-muted-foreground">
          Themed, kid-friendly, finance-flavoured identities every learner is randomly assigned
          at signup, shown to other learners everywhere a name used to appear (Arena,
          leaderboards, competitions, activity feed) - never learner-picked, never a real name.
          A learner may reroll once every 30 days. Not unique - several learners can share one.
          Turning a handle inactive stops it being newly assigned without affecting anyone who
          already has it.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Key</TableHead>
            <TableHead>Name (en / hi / hx)</TableHead>
            <TableHead>Active</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {handles.map((handle) => (
            <PeerHandleRowEditor key={handle.id} handle={handle} />
          ))}
          <NewPeerHandleRow />
        </TableBody>
      </Table>
    </div>
  );
}
