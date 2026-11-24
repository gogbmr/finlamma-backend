"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { formatChangedValue } from "@/components/admin/confirm-changes-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { glassPanel } from "@/components/admin/glass";
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
  // Task 7: the claim being confirmed, if any - a bare id/reason pair is
  // enough, the full ClaimRow is already in `claims` by id.
  const [confirmClaimId, setConfirmClaimId] = useState<string | null>(null);

  function requestRefund(claimId: string) {
    const reason = reasons[claimId]?.trim();
    if (!reason) {
      toast.error("A reason is required to refund a claim");
      return;
    }
    setConfirmClaimId(claimId);
  }

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

  const confirmClaim = claims.find((c) => c.id === confirmClaimId) ?? null;

  return (
    <div className={glassPanel("space-y-3 p-5")}>
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => requestRefund(c.id)}
                  disabled={isPending}
                >
                  Refund
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={confirmClaim !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmClaimId(null);
        }}
        title="Refund this claim?"
        description={
          confirmClaim
            ? `${formatChangedValue(confirmClaim.pricePaid, "vmoney")} will be credited back to the learner for "${confirmClaim.rewardName}". Reason: "${reasons[confirmClaim.id]?.trim()}". This never edits or removes the original claim, and can't be done twice for the same claim.`
            : ""
        }
        confirmLabel="Refund"
        onConfirm={() => {
          if (!confirmClaim) return;
          setConfirmClaimId(null);
          refund(confirmClaim.id);
        }}
      />
    </div>
  );
}
