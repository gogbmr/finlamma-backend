"use client";

import { ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { glassPanel } from "@/components/admin/glass";
import { cn } from "@/lib/cn";
import { revealParentContactAction } from "./actions";

type Row = {
  userId: string;
  displayName: string;
  status: "pending" | "consented" | "refused" | "withdrawn";
  requestedAt: string;
  actedAt: string | null;
  deleted: boolean;
};

type ConsentStatusFilter = "pending" | "consented" | "refused" | "withdrawn" | null;

type ConsentQueryState = {
  status: ConsentStatusFilter;
  includeDeleted: boolean;
  from: string;
  to: string;
};

const STATUS_OPTIONS: { value: ConsentStatusFilter; label: string }[] = [
  { value: null, label: "All" },
  { value: "pending", label: "Pending" },
  { value: "consented", label: "Consented" },
  { value: "refused", label: "Refused" },
  { value: "withdrawn", label: "Withdrawn" },
];

// Every link carries status/includeDeleted/from/to too, alongside page -
// same idea as the other entity tables' local filter-href builders. No
// q/sort params at all: this page has neither, by design (the approved
// plan never included a staff-selectable sort here, so a filter can never
// bury an old/urgent pending request behind a sort choice).
function buildConsentHref(
  pathname: string,
  state: ConsentQueryState,
  overrides: Partial<ConsentQueryState> & { page?: number },
): string {
  const merged = { ...state, ...overrides };
  const sp = new URLSearchParams();
  if (merged.status) sp.set("status", merged.status);
  if (merged.includeDeleted) sp.set("includeDeleted", "1");
  if (merged.from) sp.set("from", merged.from);
  if (merged.to) sp.set("to", merged.to);
  if (overrides.page && overrides.page > 1) sp.set("page", String(overrides.page));
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function DateRangeForm({ pathname, state }: { pathname: string; state: ConsentQueryState }) {
  const router = useRouter();
  const [from, setFrom] = useState(state.from);
  const [to, setTo] = useState(state.to);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    router.push(buildConsentHref(pathname, state, { from, to }));
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36 text-sm" />
      <span className="text-xs text-muted-foreground">to</span>
      <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36 text-sm" />
      <Button type="submit" variant="outline" size="sm">
        Filter
      </Button>
      {(state.from || state.to) && (
        <Link
          href={buildConsentHref(pathname, state, { from: "", to: "" })}
          className="text-xs text-muted-foreground underline"
        >
          Clear dates
        </Link>
      )}
    </form>
  );
}

function ParentContactCell({ userId }: { userId: string }) {
  const [isPending, startTransition] = useTransition();
  const [revealed, setRevealed] = useState<{ name: string; email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (revealed) {
    return (
      <span className="text-xs text-foreground/80">
        {revealed.name} &lt;{revealed.email}&gt;
      </span>
    );
  }

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            const result = await revealParentContactAction(userId);
            if (result.ok) {
              setRevealed({ name: result.name, email: result.email });
            } else {
              setError(result.error);
            }
          });
        }}
      >
        {isPending ? "Loading..." : "View parent details"}
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function ConsentReviewTable({
  rows,
  total,
  page,
  pageCount,
  status,
  includeDeleted,
  from,
  to,
}: {
  rows: Row[];
  total: number;
  page: number;
  pageCount: number;
  status: ConsentStatusFilter;
  includeDeleted: boolean;
  from: string;
  to: string;
}) {
  const pathname = usePathname();
  const state: ConsentQueryState = { status, includeDeleted, from, to };

  return (
    <div className={glassPanel("space-y-4 p-5")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-3 text-sm">
          {STATUS_OPTIONS.map((opt) => (
            <Link
              key={opt.label}
              href={buildConsentHref(pathname, state, { status: opt.value })}
              className={cn(
                status === opt.value
                  ? "font-semibold text-foreground underline"
                  : "text-muted-foreground hover:underline",
              )}
            >
              {opt.label}
            </Link>
          ))}
        </div>
        <DateRangeForm pathname={pathname} state={state} />
      </div>

      <Link
        href={buildConsentHref(pathname, state, { includeDeleted: !includeDeleted })}
        className="text-sm font-medium underline"
      >
        {includeDeleted ? "Hide deleted accounts" : "Show deleted accounts"}
      </Link>

      {rows.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No consent requests match these filters"
          description="Requests appear here once an under-18 account signs up and a parent is emailed for consent."
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Last action</TableHead>
                <TableHead>Parent contact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell>{row.displayName}</TableCell>
                  <TableCell>
                    {row.deleted ? (
                      <Badge variant="muted">Deleted, anonymised</Badge>
                    ) : (
                      <StatusBadge status={row.status}>{row.status}</StatusBadge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(row.requestedAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.actedAt ? new Date(row.actedAt).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell>
                    {row.deleted ? (
                      <span className="text-xs text-muted-foreground/70">Not available</span>
                    ) : (
                      <ParentContactCell userId={row.userId} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <p>
              Page {page} of {pageCount} · {total.toLocaleString("en-IN")} requests
            </p>
            <div className="flex items-center gap-1">
              {page > 1 ? (
                <Link
                  href={buildConsentHref(pathname, state, { page: page - 1 })}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-accent"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Prev
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 opacity-40">
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Prev
                </span>
              )}
              {page < pageCount ? (
                <Link
                  href={buildConsentHref(pathname, state, { page: page + 1 })}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-accent"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 opacity-40">
                  Next <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
