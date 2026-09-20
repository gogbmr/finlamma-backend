"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { LegalDocumentContent } from "@/server/legal/schemas";
import { publishLegalDocumentAction, saveLegalDraftAction } from "./actions";

type LegalDocumentType = "terms" | "privacy" | "risk_disclosure";

type DocumentState = {
  type: LegalDocumentType;
  published: { version: number; content: LegalDocumentContent; publishedAt: string | null } | null;
  draft: { version: number; content: LegalDocumentContent } | null;
};

const TYPE_LABELS: Record<LegalDocumentType, string> = {
  terms: "Terms of use",
  privacy: "Privacy policy",
  risk_disclosure: "Risk disclosure",
};

const LANGUAGES = ["en", "hi", "hx"] as const;

export function LegalEditor({ documents }: { documents: DocumentState[] }) {
  const [activeType, setActiveType] = useState<LegalDocumentType>(documents[0]!.type);
  const active = documents.find((d) => d.type === activeType) ?? documents[0]!;

  return (
    <div className="space-y-4">
      <Select value={activeType} onValueChange={(v) => setActiveType(v as LegalDocumentType)}>
        <SelectTrigger className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {documents.map((d) => (
            <SelectItem key={d.type} value={d.type}>
              {TYPE_LABELS[d.type]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Keyed by type so switching documents resets the editor's local
          draft state instead of carrying one document's edits into another. */}
      <DocumentEditor key={active.type} document={active} />
    </div>
  );
}

function DocumentEditor({ document }: { document: DocumentState }) {
  const [isPending, startTransition] = useTransition();
  const [content, setContent] = useState<LegalDocumentContent>(
    document.draft?.content ?? document.published?.content ?? { en: "", hi: "", hx: "" },
  );

  function save() {
    startTransition(async () => {
      const result = await saveLegalDraftAction({ type: document.type, content });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Draft saved");
    });
  }

  function publish() {
    startTransition(async () => {
      const result = await publishLegalDocumentAction({ type: document.type });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Published - everyone will be prompted to re-accept.");
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
        {document.published ? (
          <span>
            Published: v{document.published.version}
            {document.published.publishedAt &&
              ` on ${new Date(document.published.publishedAt).toLocaleDateString()}`}
          </span>
        ) : (
          <span>Not published yet</span>
        )}
        {document.draft && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Draft v{document.draft.version} pending publish
          </span>
        )}
      </div>

      {LANGUAGES.map((lang) => (
        <div key={lang} className="space-y-1.5">
          <label className="text-xs font-medium uppercase text-neutral-500">{lang}</label>
          <Textarea
            value={content[lang]}
            onChange={(e) => setContent((c) => ({ ...c, [lang]: e.target.value }))}
          />
        </div>
      ))}

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={save} disabled={isPending}>
          Save draft
        </Button>
        <Button type="button" onClick={publish} disabled={isPending || !document.draft}>
          Publish
        </Button>
      </div>
    </div>
  );
}
