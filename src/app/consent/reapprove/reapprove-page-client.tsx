"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LANGUAGE_LABELS,
  REAPPROVE_COPY,
  reapproveDocumentLabel,
  WEEKLY_REPORT_OPT_IN_COPY,
  type ConsentLang,
} from "../copy";
import { approveReapprovalAction, declineReapprovalAction } from "../actions";

export function ReapprovePageClient({
  token,
  childFirstName,
  documentType,
  documentVersion,
  documentContent,
}: {
  token: string;
  childFirstName: string;
  documentType: string;
  documentVersion: number;
  documentContent: { en: string; hi: string; hx: string };
}) {
  const [lang, setLang] = useState<ConsentLang>("en");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  // Always starts unticked, even for a parent who already has the weekly
  // email on - approving here is additive-only (see approveReapprovalAction's
  // comment): checking this turns it on, leaving it unchecked never turns an
  // existing opt-in off. Re-approving a legal document must never silently
  // change a preference the parent set up separately.
  const [weeklyReportOptIn, setWeeklyReportOptIn] = useState(false);
  const copy = REAPPROVE_COPY[lang];
  const optInCopy = WEEKLY_REPORT_OPT_IN_COPY[lang];
  const documentLabel = reapproveDocumentLabel(lang, documentType);

  function handleApprove() {
    startTransition(async () => {
      const res = await approveReapprovalAction(token, weeklyReportOptIn);
      setResult(
        res.ok
          ? { ok: true, message: copy.approveSuccess(res.childFirstName) }
          : { ok: false, message: res.error },
      );
    });
  }

  function handleDecline() {
    startTransition(async () => {
      const res = await declineReapprovalAction(token);
      setResult(
        res.ok
          ? { ok: true, message: copy.declineSuccess(res.childFirstName) }
          : { ok: false, message: res.error },
      );
    });
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <div className="mb-6 flex justify-end">
        <Select value={lang} onValueChange={(v) => setLang(v as ConsentLang)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(LANGUAGE_LABELS) as ConsentLang[]).map((code) => (
              <SelectItem key={code} value={code}>
                {LANGUAGE_LABELS[code]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <h1 className="text-2xl font-semibold">{copy.pageTitle}</h1>
      <p className="mt-2 text-neutral-700">{copy.intro(childFirstName, documentLabel)}</p>

      <details className="mt-6 rounded-lg border border-neutral-200 p-4" open>
        <summary className="cursor-pointer text-sm font-medium">
          {documentLabel} (v{documentVersion})
        </summary>
        <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{documentContent[lang]}</p>
      </details>

      {result?.ok ? (
        <div className="mt-8 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          {result.message}
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {result && !result.ok && <p className="text-sm text-red-700">{result.message}</p>}

          {/* Separate, unticked-by-default, optional - never part of the
              approve button below. Checking this turns the weekly email ON;
              it never turns off an opt-in you already have (see the
              WEEKLY_REPORT_OPT_IN_COPY helpText). */}
          <label className="flex items-start gap-3 rounded-lg border border-neutral-200 p-4 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={weeklyReportOptIn}
              onChange={(e) => setWeeklyReportOptIn(e.target.checked)}
              disabled={isPending}
            />
            <span>
              <span className="font-medium text-neutral-900">{optInCopy.label}</span>
              <span className="mt-1 block text-xs text-neutral-500">{optInCopy.helpText}</span>
            </span>
          </label>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={handleApprove} disabled={isPending}>
                {copy.approveButton}
              </Button>
              <Button type="button" variant="outline" onClick={handleDecline} disabled={isPending}>
                {copy.declineButton}
              </Button>
            </div>
            <p className="text-xs text-neutral-500">{copy.declineHelp}</p>
          </div>
        </div>
      )}
    </main>
  );
}
