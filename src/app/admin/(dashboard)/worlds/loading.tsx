import { AdminListSkeleton } from "@/components/admin/page-skeleton";

// Shown while the server fetches a new page/search/sort/filter (Task 2's
// extended DataTable keeps that state in URL params, so every such change
// is a real navigation Next.js shows this Suspense fallback for). Shaped
// like the actual table chrome, not the generic single-block PageSkeleton -
// see AdminListSkeleton for any later entity table reusing this pattern.
export default function Loading() {
  return <AdminListSkeleton />;
}
