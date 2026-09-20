"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { confirmParentConsentAction } from "../actions";

export function ConsentActions({ token }: { token: string }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function handleConsent() {
    startTransition(async () => {
      const res = await confirmParentConsentAction(token);
      setResult(
        res.ok
          ? { ok: true, message: `Thank you - your consent for ${res.childFirstName} has been recorded.` }
          : { ok: false, message: res.error },
      );
    });
  }

  if (result?.ok) {
    return (
      <div className="mt-8 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
        {result.message}
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-3">
      {result && !result.ok && <p className="text-sm text-red-700">{result.message}</p>}
      <Button type="button" onClick={handleConsent} disabled={isPending}>
        {isPending ? "Recording..." : "I consent"}
      </Button>
      <p className="text-xs text-neutral-500">
        &quot;I do not consent&quot; isn&apos;t available on this page yet - email
        help@finlamma.in if you want to decline.
      </p>
    </div>
  );
}
