"use client";

import { ChevronLeft, ChevronRight, Flag } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { EmptyState } from "@/components/admin/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { glassPanel } from "@/components/admin/glass";
import { markReviewedAction, revealFlaggedMessageAction } from "./actions";

type FlaggedCategory =
  | "self_harm_or_suicide"
  | "abuse_or_neglect"
  | "other_wellbeing_concern"
  | "classifier_unavailable"
  | "learner_reported"
  | "advice_language";

type Row = {
  id: string;
  threadId: string;
  role: "learner" | "assistant";
  flaggedCategory: FlaggedCategory | null;
  createdAt: string;
  reviewedAt: string | null;
  displayName: string;
  mentorName: string;
};

// A short, human label for the list's own "Flag category" column - the
// category alone (never the classifier's free-text reason, which stays
// behind the logged reveal below - /phase-audit 7).
const CATEGORY_LABEL: Record<FlaggedCategory, string> = {
  self_harm_or_suicide: "Self-harm / suicide",
  abuse_or_neglect: "Abuse / neglect",
  other_wellbeing_concern: "Wellbeing concern",
  classifier_unavailable: "Safety check failed",
  learner_reported: "Learner reported",
  advice_language: "Advice-like language",
};

const CATEGORY_OPTIONS: { value: FlaggedCategory | null; label: string }[] = [
  { value: null, label: "All categories" },
  ...(Object.entries(CATEGORY_LABEL) as [FlaggedCategory, string][]).map(([value, label]) => ({
    value,
    label,
  })),
];

const ALL_CATEGORIES = "__all__";

type DoubtZoneQueryState = {
  flaggedCategory: FlaggedCategory | null;
  includeReviewed: boolean;
  from: string;
  to: string;
};

// Every link carries flaggedCategory/includeReviewed/from/to too, alongside
// page - same idea as Consent's buildConsentHref. No q/sort params at all:
// this page has neither, by design (keeps today's fixed newest-flag-first
// order - a filter can never bury an urgent unreviewed flag behind a sort
// choice).
function buildDoubtZoneHref(
  pathname: string,
  state: DoubtZoneQueryState,
  overrides: Partial<DoubtZoneQueryState> & { page?: number },
): string {
  const merged = { ...state, ...overrides };
  const sp = new URLSearchParams();
  if (merged.flaggedCategory) sp.set("flaggedCategory", merged.flaggedCategory);
  if (merged.includeReviewed) sp.set("includeReviewed", "1");
  if (merged.from) sp.set("from", merged.from);
  if (merged.to) sp.set("to", merged.to);
  if (overrides.page && overrides.page > 1) sp.set("page", String(overrides.page));
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function DateRangeForm({ pathname, state }: { pathname: string; state: DoubtZoneQueryState }) {
  const router = useRouter();
  const [from, setFrom] = useState(state.from);
  const [to, setTo] = useState(state.to);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    router.push(buildDoubtZoneHref(pathname, state, { from, to }));
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
          href={buildDoubtZoneHref(pathname, state, { from: "", to: "" })}
          className="text-xs text-muted-foreground underline"
        >
          Clear dates
        </Link>
      )}
    </form>
  );
}

type Revealed = { content: string; flaggedReason: string | null };

function RevealCell({ messageId }: { messageId: string }) {
  const [isPending, startTransition] = useTransition();
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (revealed !== null) {
    return (
      <div className="max-w-md space-y-1">
        <p className="text-xs whitespace-pre-wrap text-foreground/80">{revealed.content}</p>
        {revealed.flaggedReason && (
          <p className="text-xs whitespace-pre-wrap text-muted-foreground">Reason: {revealed.flaggedReason}</p>
        )}
      </div>
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
            const result = await revealFlaggedMessageAction(messageId);
            if (result.ok) setRevealed({ content: result.content, flaggedReason: result.flaggedReason });
            else setError(result.error);
          });
        }}
      >
        {isPending ? "Loading..." : "View message"}
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function DoubtZoneModerationTable({
  rows: initialRows,
  total,
  page,
  pageCount,
  flaggedCategory,
  includeReviewed,
  from,
  to,
}: {
  rows: Row[];
  total: number;
  page: number;
  pageCount: number;
  flaggedCategory: FlaggedCategory | null;
  includeReviewed: boolean;
  from: string;
  to: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const pathname = usePathname();
  const router = useRouter();
  const state: DoubtZoneQueryState = { flaggedCategory, includeReviewed, from, to };

  return (
    <div className={glassPanel("space-y-4 p-5")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          value={flaggedCategory ?? ALL_CATEGORIES}
          onValueChange={(value) => {
            const next = value === ALL_CATEGORIES ? null : (value as FlaggedCategory);
            router.push(buildDoubtZoneHref(pathname, state, { flaggedCategory: next }));
          }}
        >
          <SelectTrigger className="h-8 w-48 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((opt) => (
              <SelectItem key={opt.label} value={opt.value ?? ALL_CATEGORIES}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangeForm pathname={pathname} state={state} />
      </div>

      <Link
        href={buildDoubtZoneHref(pathname, state, { includeReviewed: !includeReviewed })}
        className="text-sm font-medium underline"
      >
        {includeReviewed ? "Hide reviewed" : "Show reviewed"}
      </Link>

      {rows.length === 0 ? (
        <EmptyState
          icon={Flag}
          title="Nothing matches these filters"
          description="Messages appear here only when the safety classifier flags one, or a learner reports a reply."
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Learner</TableHead>
                <TableHead>Mentor</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Flag category</TableHead>
                <TableHead>Flagged at</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.displayName}</TableCell>
                  <TableCell>{row.mentorName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.role}</TableCell>
                  <TableCell className="max-w-xs text-xs text-muted-foreground">
                    {row.flaggedCategory ? CATEGORY_LABEL[row.flaggedCategory] : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <RevealCell messageId={row.id} />
                  </TableCell>
                  <TableCell>
                    {row.reviewedAt ? (
                      <Badge variant="muted">Reviewed</Badge>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        disabled={isPending && pendingId === row.id}
                        onClick={() => {
                          setPendingId(row.id);
                          startTransition(async () => {
                            const result = await markReviewedAction(row.id);
                            if (result.ok) {
                              setRows((prev) =>
                                prev.map((r) =>
                                  r.id === row.id ? { ...r, reviewedAt: new Date().toISOString() } : r,
                                ),
                              );
                            }
                          });
                        }}
                      >
                        Mark reviewed
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <p>
              Page {page} of {pageCount} · {total.toLocaleString("en-IN")} flagged messages
            </p>
            <div className="flex items-center gap-1">
              {page > 1 ? (
                <Link
                  href={buildDoubtZoneHref(pathname, state, { page: page - 1 })}
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
                  href={buildDoubtZoneHref(pathname, state, { page: page + 1 })}
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
