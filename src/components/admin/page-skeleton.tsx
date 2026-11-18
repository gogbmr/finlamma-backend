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

// Same role as PageSkeleton, but shaped for an admin list page built on the
// extended DataTable (Task 2: search/sort/pagination state in URL params -
// see src/components/admin/data-table.tsx, src/lib/admin/paginate.ts).
// Mirrors that exact chrome - filter row, search box, N table rows, pager -
// so Worlds' loading.tsx (and any later entity table reusing the same
// pattern) shows a skeleton shaped like what's actually about to render,
// not the generic single-block PageSkeleton.
export function AdminListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-3 w-40" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="space-y-2 rounded-lg border border-border p-4">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-24" />
      </div>
    </div>
  );
}
