"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Shared body for every admin route segment's error.tsx - the dashboard-
// level catch-all (src/app/admin/(dashboard)/error.tsx) and any per-entity
// one (e.g. worlds/error.tsx, added for Task 2 so a failure on that page's
// server-component fetch/render - a bad ?page=, a DB hiccup, ... - shows
// this panel instead of Next's generic error screen). Next.js requires a
// literal error.tsx file per segment to register a boundary, so each one
// still needs its own file; they all render this same component so the
// panel and its "Try again" behavior never drift between pages.
//
// Uses `retry`, not the older `reset` - this project pins Next 16.3.5,
// where retry() became the stable, recommended action (it re-fetches and
// re-renders the segment); reset() only clears the visible error state
// without re-fetching, which would re-show the same error on a page whose
// failure came from a data fetch (see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
// error.md - CLAUDE.md's reminder that this Next version has breaking
// changes from training data applies here too).
export function AdminPageError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
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
      <Button type="button" variant="outline" size="sm" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
