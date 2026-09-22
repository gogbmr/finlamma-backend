import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

// One consistent header for every admin page: breadcrumbs, title +
// description on the left, a primary action slot on the right. Used by
// every page under /admin/(dashboard) so the "current section" is always
// obvious the same way, regardless of which page you're on.
export function PageHeader({
  breadcrumbs,
  title,
  description,
  action,
}: {
  breadcrumbs: { label: string; href?: string }[];
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3" aria-hidden />}
            {crumb.href ? (
              <Link href={crumb.href} className="hover:text-foreground hover:underline">
                {crumb.label}
              </Link>
            ) : (
              <span className={i === breadcrumbs.length - 1 ? "font-medium text-foreground" : ""}>
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}
