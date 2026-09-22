"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Catches an unhandled error from any admin page's Server Component render
// (a data fetch that throws) so staff see a recoverable panel instead of the
// framework's default error screen. Client-side mutation errors are handled
// separately per-action via toast.error, not this boundary.
export default function AdminDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Something went wrong</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          This page hit an unexpected error. You can try again, or head back once it&apos;s
          resolved.
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
