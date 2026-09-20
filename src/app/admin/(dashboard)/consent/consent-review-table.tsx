"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { revealParentContactAction } from "./actions";

type Row = {
  userId: string;
  displayName: string;
  status: "pending" | "consented" | "refused" | "withdrawn";
  requestedAt: string;
  actedAt: string | null;
  deleted: boolean;
};

const STATUS_VARIANT: Record<Row["status"], "default" | "success" | "muted"> = {
  pending: "default",
  consented: "success",
  refused: "muted",
  withdrawn: "muted",
};

function ParentContactCell({ userId }: { userId: string }) {
  const [isPending, startTransition] = useTransition();
  const [revealed, setRevealed] = useState<{ name: string; email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (revealed) {
    return (
      <span className="text-xs text-neutral-700">
        {revealed.name} &lt;{revealed.email}&gt;
      </span>
    );
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
            const result = await revealParentContactAction(userId);
            if (result.ok) {
              setRevealed({ name: result.name, email: result.email });
            } else {
              setError(result.error);
            }
          });
        }}
      >
        {isPending ? "Loading..." : "View parent details"}
      </Button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function ConsentReviewTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-600">No consent requests yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Requested</TableHead>
          <TableHead>Last action</TableHead>
          <TableHead>Parent contact</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.userId}>
            <TableCell>{row.displayName}</TableCell>
            <TableCell>
              {row.deleted ? (
                <Badge variant="muted">Deleted, anonymised</Badge>
              ) : (
                <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
              )}
            </TableCell>
            <TableCell className="text-xs text-neutral-600">
              {new Date(row.requestedAt).toLocaleString()}
            </TableCell>
            <TableCell className="text-xs text-neutral-600">
              {row.actedAt ? new Date(row.actedAt).toLocaleString() : "—"}
            </TableCell>
            <TableCell>
              {row.deleted ? (
                <span className="text-xs text-neutral-400">Not available</span>
              ) : (
                <ParentContactCell userId={row.userId} />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
