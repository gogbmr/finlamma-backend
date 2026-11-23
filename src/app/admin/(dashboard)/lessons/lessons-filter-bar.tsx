"use client";

import { useRouter, usePathname } from "next/navigation";
import { buildAdminListHref, type AdminListUrlState } from "@/components/admin/data-table";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LocalizedText } from "@/server/shared/schemas";
import { KIND_LABELS } from "./lessons-table";

export const ALL_WORLDS = "all";

type StatusFilter = "draft" | "published" | null;

const STATUS_SELECT_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

const KIND_SELECT_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All kinds" },
  ...Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label })),
];

type WorldOption = { id: string; order: number; title: LocalizedText };

// Replaces the old per-world "chip" link row (page.tsx) and the status/
// kind chip-link rows (lessons-table.tsx) with three dropdown selects,
// grouped together above the table. Every change navigates via
// buildAdminListHref (same URL-state-of-truth convention as every other
// admin list) - q/sort/dir/pageSize carry over, page resets to 1.
export function LessonsFilterBar({
  worlds,
  worldId,
  kind,
  status,
  q,
  sort,
  dir,
  pageSize,
}: {
  worlds: WorldOption[];
  worldId: string;
  kind: string | null;
  status: StatusFilter;
  q: string;
  sort: string | null;
  dir: "asc" | "desc";
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const state: AdminListUrlState = { q, sort, dir, pageSize };

  function go(extraParams: Record<string, string>) {
    router.push(buildAdminListHref(pathname, state, {}, extraParams));
  }

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">World</Label>
        <Select
          value={worldId}
          onValueChange={(value) => go({ worldId: value, kind: kind ?? "all", status: status ?? "all" })}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_WORLDS}>All worlds</SelectItem>
            {worlds.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.order}. {w.title.en || "(untitled)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Status</Label>
        <Select
          value={status ?? "all"}
          onValueChange={(value) => go({ worldId, kind: kind ?? "all", status: value })}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_SELECT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Kind</Label>
        <Select
          value={kind ?? "all"}
          onValueChange={(value) => go({ worldId, kind: value, status: status ?? "all" })}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KIND_SELECT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
