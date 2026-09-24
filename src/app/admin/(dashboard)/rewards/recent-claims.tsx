"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { refundRewardClaimAction } from "./actions";

type ClaimRow = {
  id: string;
  userId: string;
  rewardId: string;
  rewardName: string;
  pricePaid: number;
  claimedAt: string | Date;
};

export function RecentClaims({ claims }: { claims: ClaimRow[] }) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function refund(claimId: string) {
    const reason = reasons[claimId]?.trim();
    if (!reason) {
      toast.error("A reason is required to refund a claim");
      return;
    }
    startTransition(async () => {
      const result = await refundRewardClaimAction({ claimId, reason });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Refunded");
      setReasons((r) => ({ ...r, [claimId]: "" }));
    });
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Recent claims</h2>
      <p className="text-xs text-muted-foreground">
        Refunding credits the exact price paid back to the learner as a new ledger entry - it never
        edits or removes the original claim, and never refunds the same claim twice.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reward</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Price paid</TableHead>
            <TableHead>Claimed</TableHead>
            <TableHead>Refund reason</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {claims.map((c) => (
            <TableRow key={c.id}>
              <TableCell>{c.rewardName}</TableCell>
              <TableCell className="font-mono text-xs">{c.userId}</TableCell>
              <TableCell>{c.pricePaid}</TableCell>
              <TableCell>{new Date(c.claimedAt).toLocaleString()}</TableCell>
              <TableCell>
                <Input
                  value={reasons[c.id] ?? ""}
                  onChange={(e) => setReasons((r) => ({ ...r, [c.id]: e.target.value }))}
                  placeholder="Required"
                  className="w-48"
                />
              </TableCell>
              <TableCell>
                <Button type="button" variant="outline" size="sm" onClick={() => refund(c.id)} disabled={isPending}>
                  Refund
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
