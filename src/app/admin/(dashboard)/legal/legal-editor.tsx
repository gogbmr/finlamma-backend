"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
  published: {
    version: number;
    content: LegalDocumentContent;
    publishedAt: string | null;
    isPlaceholder: boolean;
  } | null;
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

// A staff member must explicitly pick one before Publish is enabled - no
// default, since silently defaulting either way would either skip a needed
// re-approval or needlessly limit-access every minor on a trivial wording
// fix (see the plan's condition #1).
type ReapprovalChoice = "yes" | "no";

function DocumentEditor({ document }: { document: DocumentState }) {
  const [isPending, startTransition] = useTransition();
  const [content, setContent] = useState<LegalDocumentContent>(
    document.draft?.content ?? document.published?.content ?? { en: "", hi: "", hx: "" },
  );
  const [reapprovalChoice, setReapprovalChoice] = useState<ReapprovalChoice | null>(null);

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
    if (!reapprovalChoice) return;
    startTransition(async () => {
      const result = await publishLegalDocumentAction({
        type: document.type,
        requiresParentReapproval: reapprovalChoice === "yes",
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setReapprovalChoice(null);
      toast.success(
        reapprovalChoice === "yes"
          ? "Published - every affected minor's parent will be emailed to re-approve."
          : "Published - everyone will be prompted to re-accept.",
      );
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {document.published ? (
          <span>
            Published: v{document.published.version}
            {document.published.publishedAt &&
              ` on ${new Date(document.published.publishedAt).toLocaleDateString()}`}
          </span>
        ) : (
          <span>Not published yet</span>
        )}
        {document.published?.isPlaceholder && (
          <Badge variant="destructive">PLACEHOLDER — NOT FOR LAUNCH</Badge>
        )}
        {document.draft && <Badge variant="warning">Draft v{document.draft.version} pending publish</Badge>}
      </div>

      {LANGUAGES.map((lang) => (
        <div key={lang} className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase">{lang}</label>
          <Textarea
            value={content[lang]}
            onChange={(e) => setContent((c) => ({ ...c, [lang]: e.target.value }))}
          />
        </div>
      ))}

      {document.draft && (
        <div className="space-y-2 rounded-md border border-border bg-muted/50 p-3">
          <p className="text-sm font-medium text-foreground">
            Does this change require every already-consented minor&apos;s parent to re-approve?
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={reapprovalChoice === "yes" ? "default" : "outline"}
              size="sm"
              onClick={() => setReapprovalChoice("yes")}
            >
              Yes, material change
            </Button>
            <Button
              type="button"
              variant={reapprovalChoice === "no" ? "default" : "outline"}
              size="sm"
              onClick={() => setReapprovalChoice("no")}
            >
              No, minor/wording only
            </Button>
          </div>
          {reapprovalChoice === "yes" && (
            <p className="rounded bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              Every minor whose parent already consented will lose full access until their parent
              re-approves this version. They&apos;ll each get an email with a fresh 7-day link.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={save} disabled={isPending}>
          Save draft
        </Button>
        <Button type="button" onClick={publish} disabled={isPending || !document.draft || !reapprovalChoice}>
          Publish
        </Button>
      </div>
    </div>
  );
}
