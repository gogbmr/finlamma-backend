"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { correctDateOfBirthAction } from "./actions";

// App asks batch, section C3 - consent.correct_dob (super_admin only).
// Standalone, not per-row in the table below: that table only ever lists
// minors with an active consent record, but a DOB correction can apply to
// any account, adult or minor. Staff paste in the account id directly.
export function DobCorrectionForm() {
  const [isPending, startTransition] = useTransition();
  const [userId, setUserId] = useState("");
  const [newDateOfBirth, setNewDateOfBirth] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ ok: true; dateOfBirth: string; isMinor: boolean } | { ok: false; error: string } | null>(null);

  function submit() {
    setResult(null);
    startTransition(async () => {
      const outcome = await correctDateOfBirthAction({ userId, newDateOfBirth, reason });
      setResult(outcome);
      if (outcome.ok) {
        setUserId("");
        setNewDateOfBirth("");
        setReason("");
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div>
        <p className="text-sm font-medium text-foreground">Correct a learner&apos;s date of birth</p>
        <p className="text-xs text-muted-foreground">
          For a genuine mistake only - a date resulting in an under-13 account is rejected and that
          account is immediately queued for deletion, the same as a brand-new under-13 signup.
          Every correction is logged with a required reason.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>Account id</Label>
          <Input value={userId} onChange={(e) => setUserId(e.target.value)} disabled={isPending} placeholder="uuid" />
        </div>
        <div className="space-y-1">
          <Label>Corrected date of birth</Label>
          <Input
            type="date"
            value={newDateOfBirth}
            onChange={(e) => setNewDateOfBirth(e.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="space-y-1">
          <Label>Reason (required)</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} disabled={isPending} rows={1} />
        </div>
      </div>

      <Button type="button" onClick={submit} disabled={isPending || !userId || !newDateOfBirth || !reason}>
        {isPending ? "Saving..." : "Save correction"}
      </Button>

      {result && !result.ok && <p className="text-sm text-destructive">{result.error}</p>}
      {result && result.ok && (
        <p className="text-sm text-emerald-600">
          Updated to {result.dateOfBirth} ({result.isMinor ? "minor" : "adult"}).
        </p>
      )}
    </div>
  );
}
