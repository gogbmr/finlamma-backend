"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const LANGUAGES = ["en", "hi", "hx"] as const;
type Lang = (typeof LANGUAGES)[number];

function isLocalizedTextShaped(value: unknown): value is Record<Lang, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    LANGUAGES.every((lang) => typeof (value as Record<string, unknown>)[lang] === "string")
  );
}

// Mirrors src/server/shared/schemas.ts's findMissingLocalizedText's walk,
// but replaces each {en,hi,hx} leaf with just that language's string
// instead of collecting missing ones - so the preview renders exactly what
// the app would show a learner in the selected language, for any lesson
// kind's content shape, without per-kind rendering code.
function localize(value: unknown, lang: Lang): unknown {
  if (isLocalizedTextShaped(value)) return value[lang];
  if (Array.isArray(value)) return value.map((item) => localize(item, lang));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, localize(v, lang)]));
  }
  return value;
}

export function LessonPreview({
  data,
  onClose,
}: {
  data: { id: string; chapter: number; step: number; kind: string; title: unknown; blurb: unknown; content: unknown };
  onClose: () => void;
}) {
  const [lang, setLang] = useState<Lang>("en");
  const localized = localize(data, lang) as {
    chapter: number;
    step: number;
    kind: string;
    title: string;
    blurb: string;
    content: unknown;
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">
          Preview - this is the exact answer-free shape the app receives (see
          docs/ARCHITECTURE.md D18) for a published lesson at this position.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="flex gap-1">
        {LANGUAGES.map((l) => (
          <Button
            key={l}
            type="button"
            size="sm"
            variant={lang === l ? "default" : "outline"}
            onClick={() => setLang(l)}
          >
            {l.toUpperCase()}
          </Button>
        ))}
      </div>

      <div className="space-y-2 rounded-md bg-muted/50 p-3">
        <p className="text-xs text-muted-foreground uppercase">
          Ch{localized.chapter}/Step{localized.step} - {localized.kind}
        </p>
        <h3 className="text-base font-semibold text-foreground">{localized.title}</h3>
        <p className="text-sm text-foreground/80">{localized.blurb}</p>
        <pre className="mt-2 overflow-x-auto rounded bg-foreground p-2 text-xs text-background">
          {JSON.stringify(localized.content, null, 2)}
        </pre>
      </div>
    </div>
  );
}
