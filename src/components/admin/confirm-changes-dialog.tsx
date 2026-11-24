"use client";

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

// Task 7: a single shared "review before you save" dialog for every money
// page (Badges/Rewards/Competitions/Settings->Arena League/Settings->
// Lesson-flow Scoring). It does NO conversion of its own - every value it
// renders is exactly what the caller already has in its own form state
// (the same number/string the page already displays), so there is no new
// paise<->rupee or VM<->paise math anywhere in this file. Its only two
// jobs are: (1) filter a field list down to the ones that actually
// changed, and (2) format a "vmoney" field as "₹<en-IN grouped> V Money" -
// a pure display wrapper around a number that's already whole V Money
// units (1 VM = ₹1, D37 docs/ARCHITECTURE.md), never a unit conversion.
//
// `kind: "vmoney"` is reserved for real V Money fields only. A rupee
// amount that explicitly ISN'T V Money (Competitions' virtualCapitalPaise,
// D57) must never use it - the caller pre-formats that into a plain
// display string (e.g. "₹1,00,000") and passes `kind: "text"` (the
// default), so this dialog can't mislabel it.
export type ChangedFieldInput = {
  label: string;
  oldValue: string | number | boolean | null;
  newValue: string | number | boolean | null;
  kind?: "vmoney" | "text";
};

export type ChangedField = ChangedFieldInput & { kind: "vmoney" | "text" };

// Exported separately from the dialog component so the "what counts as
// changed" and "how is a value displayed" rules are unit-testable without
// rendering anything.
export function diffChangedFields(fields: ChangedFieldInput[]): ChangedField[] {
  return fields
    .filter((f) => f.oldValue !== f.newValue)
    .map((f) => ({ ...f, kind: f.kind ?? "text" }));
}

export function formatChangedValue(value: string | number | boolean | null, kind: "vmoney" | "text"): string {
  if (kind === "vmoney" && typeof value === "number") {
    return `₹${value.toLocaleString("en-IN")} V Money`;
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === "") return "(empty)";
  return String(value);
}

export function ConfirmChangesDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  onConfirm,
  confirmLabel = "Save",
  cancelLabel = "Cancel",
  pending = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: ChangedField[];
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={GLASS_PANEL}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {/* asChild + a <div> here, not the default <p> - AlertDialogDescription
              renders a <p> by default, and a <ul> can never legally nest
              inside one. */}
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {description && <p>{description}</p>}
              {fields.length === 0 ? (
                <p>No fields changed.</p>
              ) : (
                <ul className="list-disc space-y-1 pl-4">
                  {fields.map((f, i) => (
                    <li key={i}>
                      <span className="font-medium text-foreground">{f.label}:</span>{" "}
                      {formatChangedValue(f.oldValue, f.kind)} →{" "}
                      <strong className="text-foreground">{formatChangedValue(f.newValue, f.kind)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: "default" }))}
            onClick={onConfirm}
            disabled={pending}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
