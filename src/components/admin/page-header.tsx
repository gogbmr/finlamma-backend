import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

// One consistent header for every admin page: breadcrumbs, an optional icon
// chip, title + description on the left, a primary action slot on the
// right. Used by every page under /admin/(dashboard) so the "current
// section" is always obvious the same way, regardless of which page you're
// on - the icon chip (added alongside the KpiTile/EmptyState pass, see
// src/components/admin/kpi-tile.tsx) is what gives each page a visual
// identity at a glance instead of every page opening on the same plain
// text heading. Admin stays light/professional throughout - this chip uses
// the same calm secondary-violet treatment as every other admin surface,
// never the homepage's gold/navy game palette.
export function PageHeader({
  breadcrumbs,
  icon: Icon,
  title,
  description,
  action,
}: {
  breadcrumbs: { label: string; href?: string }[];
  icon?: ComponentType<{ className?: string }>;
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
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-semibold text-foreground">{title}</h1>
            {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}
