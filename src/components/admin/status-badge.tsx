import { Badge } from "@/components/ui/badge";

// One consistent status pill for every content/consent/staff status shown
// across the admin - draft/published/in-progress map to the named
// --status-* tokens (src/app/globals.css); anything else (withdrawn,
// refused, inactive, ...) falls back to a plain muted pill. Labels are
// passed in by the caller (already domain-specific text like "draft" or
// "12 in progress"), this only owns the color.
const STATUS_VARIANT = {
  draft: "warning",
  published: "success",
  in_progress: "info",
  completed: "success",
  active: "success",
  consented: "success",
  pending: "info",
  withdrawn: "destructive",
  refused: "destructive",
  declined: "destructive",
  inactive: "muted",
} as const;

export type KnownStatus = keyof typeof STATUS_VARIANT;

export function StatusBadge({
  status,
  children,
}: {
  status: KnownStatus | (string & {});
  children: React.ReactNode;
}) {
  const variant = (STATUS_VARIANT as Record<string, (typeof STATUS_VARIANT)[KnownStatus]>)[status] ?? "muted";
  return <Badge variant={variant}>{children}</Badge>;
}
