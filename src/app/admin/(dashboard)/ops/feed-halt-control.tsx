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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { MAX_HALT_REASON_LENGTH } from "@/server/trading/schemas";
import { setFeedModeAction, setGlobalHaltAction } from "./actions";

type FeedMode = "live" | "delayed_15m" | "paused";

const FEED_MODE_LABEL: Record<FeedMode, string> = {
  live: "LIVE",
  delayed_15m: "DELAYED 15M",
  paused: "PAUSED",
};

const FEED_MODES: FeedMode[] = ["live", "delayed_15m", "paused"];

function feedModeEffect(mode: FeedMode): string {
  switch (mode) {
    case "live":
      return "Every learner will see live prices as they move.";
    case "delayed_15m":
      return "Every learner will see prices delayed by 15 minutes, clearly labelled as such.";
    case "paused":
      return "Every learner will see the price feed frozen at its last value - no new ticks until you change this back.";
  }
}

export function FeedHaltControl({
  feedMode,
  globalHalt,
}: {
  feedMode: FeedMode;
  globalHalt: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [pendingFeedMode, setPendingFeedMode] = useState<FeedMode | null>(null);
  const [feedReason, setFeedReason] = useState("");
  const [haltConfirmOpen, setHaltConfirmOpen] = useState(false);
  const [haltReason, setHaltReason] = useState("");

  const haltReasonError =
    haltReason.trim().length === 0
      ? "A reason is required"
      : haltReason.length > MAX_HALT_REASON_LENGTH
        ? `Must be at most ${MAX_HALT_REASON_LENGTH} characters`
        : null;

  function confirmFeedMode() {
    if (!pendingFeedMode) return;
    const mode = pendingFeedMode;
    setPendingFeedMode(null);
    startTransition(async () => {
      const result = await setFeedModeAction(mode, feedReason);
      setFeedReason("");
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Feed mode changed to ${FEED_MODE_LABEL[mode]}`);
    });
  }

  function confirmHalt() {
    if (haltReasonError) return;
    const next = !globalHalt;
    const reason = haltReason;
    setHaltConfirmOpen(false);
    setHaltReason("");
    startTransition(async () => {
      const result = await setGlobalHaltAction(next, reason);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(next ? "Global trading halt is now ON" : "Global trading halt is now OFF");
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">Price feed control</h2>
        <p className="text-xs text-muted-foreground">
          Changes what every learner sees immediately. No synthetic prices, ever - PAUSED simply
          freezes the last real value.
        </p>
      </div>

      <div className="flex gap-2">
        {FEED_MODES.map((mode) => (
          <Button
            key={mode}
            type="button"
            size="sm"
            variant={feedMode === mode ? "default" : "outline"}
            disabled={isPending}
            onClick={() => setPendingFeedMode(mode)}
          >
            {FEED_MODE_LABEL[mode]}
          </Button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
        <div>
          <p className="text-sm font-medium text-foreground">Global trading halt</p>
          <p className="text-xs text-muted-foreground">
            {globalHalt ? "Active - every order pad rejects right now." : "Off - trading is running normally."}
          </p>
        </div>
        <Button
          type="button"
          variant={globalHalt ? "outline" : "destructive"}
          disabled={isPending}
          onClick={() => setHaltConfirmOpen(true)}
        >
          {globalHalt ? "Resume trading" : "Halt all trading"}
        </Button>
      </div>

      <AlertDialog open={pendingFeedMode !== null} onOpenChange={(open) => !open && setPendingFeedMode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Change feed mode to {pendingFeedMode ? FEED_MODE_LABEL[pendingFeedMode] : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>{pendingFeedMode ? feedModeEffect(pendingFeedMode) : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1 px-6 pb-2">
            <Label htmlFor="feed-reason">Reason (optional)</Label>
            <Textarea
              id="feed-reason"
              value={feedReason}
              onChange={(e) => setFeedReason(e.target.value)}
              placeholder="e.g. vendor outage, scheduled maintenance"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmFeedMode}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={haltConfirmOpen} onOpenChange={setHaltConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{globalHalt ? "Resume trading for every learner?" : "Halt all trading for every learner?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {globalHalt
                ? "This immediately allows every learner to place BUY/SELL orders (stocks and funds) again."
                : "This stops all trading for every learner, immediately. No BUY or SELL order - stock or fund, anywhere in the app - can be placed until you turn this off."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1 px-6 pb-2">
            <Label htmlFor="halt-reason">Reason (required)</Label>
            <Textarea
              id="halt-reason"
              value={haltReason}
              onChange={(e) => setHaltReason(e.target.value)}
              placeholder="e.g. suspicious price feed, investigating a bug in order matching"
              className={cn(haltReasonError && "border-destructive")}
            />
            {haltReasonError && <p className="text-xs text-destructive">{haltReasonError}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmHalt} disabled={haltReasonError !== null}>
              {globalHalt ? "Resume trading" : "Halt all trading"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
