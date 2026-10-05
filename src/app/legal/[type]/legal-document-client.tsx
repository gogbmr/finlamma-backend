"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LANGUAGE_LABELS,
  LEGAL_PAGE_COPY,
  reapproveDocumentLabel,
  type ConsentLang,
} from "@/app/consent/copy";

// Same storage key convention the rest of the app would use for a per-viewer
// UI preference (no other page persists one yet, so this is the first) -
// wrapped in try/catch since localStorage can throw or be unavailable
// (private browsing, blocked site data) and a remembered language is a
// convenience, never something that should break the page if it fails.
const STORAGE_KEY = "finlamma_legal_lang";

function readStoredLang(): ConsentLang {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "en" || value === "hi" || value === "hx" ? value : "en";
  } catch {
    return "en";
  }
}

function writeStoredLang(lang: ConsentLang) {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Best-effort only - a failed write just means the choice isn't
    // remembered next time, not a broken page.
  }
}

// useSyncExternalStore (not useEffect+setState, which the lint config
// flags as a cascading-render anti-pattern for exactly this "read an
// external store on mount" case) - subscribe is a no-op because nothing
// else in this tab changes the stored language after mount; getServerSnapshot
// always returns "en" so SSR/hydration never touches localStorage and the
// server-rendered markup always matches the client's first paint.
function subscribe() {
  return () => {};
}
function getServerSnapshot(): ConsentLang {
  return "en";
}

export function LegalDocumentClient({
  type,
  version,
  content,
  isPlaceholder,
}: {
  type: string;
  version: number;
  content: { en: string; hi: string; hx: string };
  isPlaceholder: boolean;
}) {
  // Defaults to English, same as every other page that uses this switcher
  // (/consent/confirm, /consent/reapprove). storedLang is the remembered
  // choice (or "en" if there isn't one / localStorage is unavailable);
  // override is set only when the viewer actively changes it this session,
  // so a fresh explicit choice always wins over whatever was stored before.
  const storedLang = useSyncExternalStore(subscribe, readStoredLang, getServerSnapshot);
  const [override, setOverride] = useState<ConsentLang | null>(null);
  const lang = override ?? storedLang;

  function handleLangChange(next: ConsentLang) {
    setOverride(next);
    writeStoredLang(next);
  }

  const copy = LEGAL_PAGE_COPY[lang];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-sm font-medium text-primary hover:underline">
          {copy.backLink}
        </Link>
        <Select value={lang} onValueChange={(v) => handleLangChange(v as ConsentLang)}>
          <SelectTrigger className="w-32">
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

      <h1 className="mt-4 text-2xl font-bold text-foreground">
        {reapproveDocumentLabel(lang, type)}
      </h1>

      {/* Always rendered regardless of which language is selected - this
          banner must never disappear just because a parent/learner switches
          language (CLAUDE.md: the placeholder status must stay visible). */}
      {isPlaceholder && (
        <p className="mt-3 rounded-md border border-status-draft-fg/30 bg-status-draft-bg px-3 py-2 text-sm text-status-draft-fg">
          {copy.placeholderNotice}
        </p>
      )}

      <p className="mt-2 text-xs text-muted-foreground">{copy.versionLabel(version)}</p>
      <div className="mt-6 space-y-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
        {content[lang]}
      </div>
    </div>
  );
}
