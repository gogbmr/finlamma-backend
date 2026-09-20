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
import { CONFIRM_COPY, LANGUAGE_LABELS, type ConsentLang } from "../copy";
import { confirmParentConsentAction, declineParentConsentAction } from "../actions";

type ConsentDocument = {
  type: string;
  version: number;
  content: { en: string; hi: string; hx: string };
};

const DOC_TYPE_LABEL: Record<ConsentLang, Record<string, string>> = {
  en: { terms: "Terms of use", privacy: "Privacy policy", risk_disclosure: "Risk disclosure" },
  hi: { terms: "Upyog ki sharten", privacy: "Gopniyata niti", risk_disclosure: "Jokhim prakatikaran" },
  hx: { terms: "Terms of use", privacy: "Privacy policy", risk_disclosure: "Risk disclosure" },
};

export function ConsentPageClient({
  token,
  childFirstName,
  documents,
}: {
  token: string;
  childFirstName: string;
  documents: ConsentDocument[];
}) {
  const [lang, setLang] = useState<ConsentLang>("en");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const copy = CONFIRM_COPY[lang];

  function handleConsent() {
    startTransition(async () => {
      const res = await confirmParentConsentAction(token);
      setResult(
        res.ok
          ? { ok: true, message: copy.consentSuccess(res.childFirstName) }
          : { ok: false, message: res.error },
      );
    });
  }

  function handleDecline() {
    startTransition(async () => {
      const res = await declineParentConsentAction(token);
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
      <p className="mt-2 text-neutral-700">{copy.intro(childFirstName)}</p>

      <section className="mt-6 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
        <h2 className="font-medium">{copy.whatWeCollectTitle}</h2>
        <p>{copy.whatWeCollectBody}</p>
      </section>

      <div className="mt-6 space-y-3">
        {documents.map((doc) => (
          <details key={doc.type} className="rounded-lg border border-neutral-200 p-4">
            <summary className="cursor-pointer text-sm font-medium">
              {DOC_TYPE_LABEL[lang][doc.type] ?? doc.type} (v{doc.version})
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{doc.content[lang]}</p>
          </details>
        ))}
      </div>

      {result?.ok ? (
        <div className="mt-8 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          {result.message}
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {result && !result.ok && <p className="text-sm text-red-700">{result.message}</p>}
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={handleConsent} disabled={isPending}>
              {copy.consentButton}
            </Button>
            <Button type="button" variant="outline" onClick={handleDecline} disabled={isPending}>
              {copy.declineButton}
            </Button>
          </div>
          <p className="text-xs text-neutral-500">{copy.declineHelp}</p>
        </div>
      )}
    </main>
  );
}
