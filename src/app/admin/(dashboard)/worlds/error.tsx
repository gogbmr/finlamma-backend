"use client"; // Error boundaries must be Client Components - required on
// this literal file, confirmed by pnpm build (see (dashboard)/error.tsx's
// comment for why re-exporting a client component isn't enough on its own).

// Worlds-specific error boundary (Task 2's loading/error-state gap): closer
// to the source than the shared (dashboard)/error.tsx, which still catches
// every other admin page without its own. Same panel, same retry() action -
// see src/components/admin/page-error.tsx. Any later entity table built on
// the same search/sort/pagination pattern (Task 3) reuses this exact
// one-line file, just at its own path.
export { AdminPageError as default } from "@/components/admin/page-error";
