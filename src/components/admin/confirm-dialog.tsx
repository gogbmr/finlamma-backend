"use client";

import type { ReactNode } from "react";
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
import { buttonVariants } from "@/components/ui/button";
import { GLASS_PANEL } from "@/components/admin/glass";
import { cn } from "@/lib/cn";

// A controlled confirmation dialog for a destructive/impactful action
// (unpublish, a change that affects other content, ...) - replaces a raw
// window.confirm() with something on-brand and screen-reader friendly.
// Controlled (open/onOpenChange) rather than imperative, so it composes
// with the existing useTransition-based Server Action handlers already
// used throughout the admin: the caller sets `open` when the action is
// requested, and only calls the real mutation from `onConfirm`.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  onConfirm,
  destructive = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  destructive?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {/* The confirm/alert-dialog overlay already dims the backdrop ~40% -
          that's what makes the standard GLASS_PANEL translucency (not the
          more opaque chrome level the sidebar/top bar use) still read
          clearly here, the same way it does over any content card. */}
      <AlertDialogContent className={GLASS_PANEL}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={cn(!destructive && buttonVariants({ variant: "default" }))}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
