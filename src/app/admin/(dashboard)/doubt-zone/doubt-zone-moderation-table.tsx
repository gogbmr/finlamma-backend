"use client";

import { Flag } from "lucide-react";
import { useState, useTransition } from "react";
import { EmptyState } from "@/components/admin/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { markReviewedAction, revealFlaggedMessageAction } from "./actions";

type Row = {
  id: string;
  threadId: string;
  role: "learner" | "assistant";
  flaggedReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  displayName: string;
  mentorName: string;
};

function RevealCell({ messageId }: { messageId: string }) {
  const [isPending, startTransition] = useTransition();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (revealed !== null) {
    return <p className="max-w-md text-xs whitespace-pre-wrap text-foreground/80">{revealed}</p>;
  }

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            const result = await revealFlaggedMessageAction(messageId);
            if (result.ok) setRevealed(result.content);
            else setError(result.error);
          });
        }}
      >
        {isPending ? "Loading..." : "View message"}
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function DoubtZoneModerationTable({ rows: initialRows }: { rows: Row[] }) {
  const [rows, setRows] = useState(initialRows);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Flag}
        title="Nothing flagged"
        description="Messages appear here only when the safety classifier flags one, or a learner reports a reply."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Learner</TableHead>
          <TableHead>Mentor</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Flag reason</TableHead>
          <TableHead>Flagged at</TableHead>
          <TableHead>Message</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.displayName}</TableCell>
            <TableCell>{row.mentorName}</TableCell>
            <TableCell className="text-xs text-muted-foreground">{row.role}</TableCell>
            <TableCell className="max-w-xs text-xs text-muted-foreground">{row.flaggedReason ?? "—"}</TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {new Date(row.createdAt).toLocaleString()}
            </TableCell>
            <TableCell>
              <RevealCell messageId={row.id} />
            </TableCell>
            <TableCell>
              {row.reviewedAt ? (
                <Badge variant="muted">Reviewed</Badge>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending && pendingId === row.id}
                  onClick={() => {
                    setPendingId(row.id);
                    startTransition(async () => {
                      const result = await markReviewedAction(row.id);
                      if (result.ok) {
                        setRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, reviewedAt: new Date().toISOString() } : r)),
                        );
                      }
                    });
                  }}
                >
                  Mark reviewed
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
