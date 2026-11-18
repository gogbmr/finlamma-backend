"use client"; // Error boundaries must be Client Components - Next.js checks
// this file literally, not just whether the component it renders is a
// client component elsewhere, so re-exporting AdminPageError without this
// directive here fails the build (confirmed: pnpm build rejected this
// exact file with "must be a Client Component" until this line was added).

// Catches an unhandled error from any admin page's Server Component render
// (a data fetch that throws) so staff see a recoverable panel instead of the
// framework's default error screen. Client-side mutation errors are handled
// separately per-action via toast.error, not this boundary. A thrown error
// here is NOT caught by this file's own layout.tsx - Next.js error
// boundaries never catch an error thrown by the layout.tsx in their own
// route segment, only by page.tsx/nested layouts below it (confirmed
// against this Next version's own docs,
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
// error.md: "It does not wrap the layout.js ... above it in the same
// segment").
//
// This is the catch-all for every admin page that doesn't have its own
// error.tsx. A page can register a more specific one in its own folder
// (e.g. worlds/error.tsx) - Next.js picks the closest boundary to the
// error's source, so that one wins for errors thrown in that page alone.
// Both render the same AdminPageError panel.
export { AdminPageError as default } from "@/components/admin/page-error";
