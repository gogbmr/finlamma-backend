import type { ComponentType } from "react";
import { cn } from "@/lib/cn";

// Shared KPI tile for every admin console that shows a grid of numbers
// (Ops, Analytics, News Desk) - replaces each page's own copy-pasted
// `rounded-lg border bg-card p-4` div. Two purposes: (1) one place to fix
// "every tile looks identical regardless of importance" (the `emphasis`
// prop gives the one headline stat per page real visual weight - bigger
// number, a tinted background, an accented icon - while supporting stats
// stay plain), and (2) an optional icon, since a page of bare numbers reads
// as a spreadsheet, not a console. Admin stays light/professional - accent
// colours here are the existing `--primary`/`--secondary` tokens already
// used everywhere else in admin, never the homepage's gold/navy palette.
export function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
  emphasis = "default",
}: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  emphasis?: "primary" | "default";
}) {
  const isPrimary = emphasis === "primary";
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        isPrimary ? "border-primary/20 bg-primary/5" : "border-border bg-card",
      )}
    >
      <div className="flex items-center gap-2">
        {Icon && (
          <Icon className={cn("h-4 w-4", isPrimary ? "text-primary" : "text-muted-foreground")} />
        )}
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      </div>
      <p
        className={cn(
          "mt-1.5 font-mono font-bold text-foreground",
          isPrimary ? "text-3xl" : "text-2xl",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// A row of KpiTiles, first one promoted to `emphasis="primary"` by default
// (override per-tile with an explicit `emphasis` if a different stat should
// lead) - the mechanism that actually fixes "every tile has equal weight."
export function KpiTileGrid({
  tiles,
}: {
  tiles: { icon?: ComponentType<{ className?: string }>; label: string; value: string; hint?: string; emphasis?: "primary" | "default" }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile, i) => (
        <KpiTile key={tile.label} {...tile} emphasis={tile.emphasis ?? (i === 0 ? "primary" : "default")} />
      ))}
    </div>
  );
}
