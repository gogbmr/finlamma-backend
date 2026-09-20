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
import { LANGUAGE_LABELS, WITHDRAW_COPY, type ConsentLang } from "../copy";
import { withdrawParentConsentAction } from "../actions";

export function WithdrawPageClient({
  token,
  childFirstName,
}: {
  token: string;
  childFirstName: string;
}) {
  const [lang, setLang] = useState<ConsentLang>("en");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const copy = WITHDRAW_COPY[lang];

  function handleWithdraw() {
    startTransition(async () => {
      const res = await withdrawParentConsentAction(token);
      setResult(
        res.ok
          ? {
              ok: true,
              message: res.alreadyWithdrawn
                ? copy.alreadyWithdrawn(res.childFirstName)
                : copy.success(res.childFirstName),
            }
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

      {result?.ok ? (
        <div className="mt-8 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          {result.message}
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {result && !result.ok && <p className="text-sm text-red-700">{result.message}</p>}
          <Button type="button" variant="outline" onClick={handleWithdraw} disabled={isPending}>
            {copy.withdrawButton}
          </Button>
        </div>
      )}
    </main>
  );
}
