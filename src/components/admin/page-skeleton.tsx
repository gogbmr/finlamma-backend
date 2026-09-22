import { Skeleton } from "@/components/ui/skeleton";

// Shown automatically by Next.js (via each route's loading.tsx) while an
// admin page's Server Component is fetching data - mirrors the general
// shape of PageHeader + a content block so there's no layout jump when the
// real content replaces it.
export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-3 w-40" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="space-y-2 rounded-lg border border-border p-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="mt-4 h-24 w-full" />
      </div>
    </div>
  );
}
