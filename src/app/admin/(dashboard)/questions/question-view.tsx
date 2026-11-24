import { Info, MessageSquareText } from "lucide-react";
import { StatusBadge } from "@/components/admin/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GLASS_PANEL } from "@/components/admin/glass";
import type { LocalizedText } from "@/server/shared/schemas";
import { FORMAT_LABELS, type QuestionRow } from "./question-editor";

const LANGUAGES = [
  { key: "en", label: "English" },
  { key: "hi", label: "Hindi" },
  { key: "hx", label: "Hinglish" },
] as const;

// Read-only summary for a question - deliberately not a disabled form (the
// Edit page is for that). Payload/answer shape varies a lot by format
// (single_select/ordering/sort_buckets/fill_blank/match_pairs/
// spot_mistake/number_guess, each with its own shape - see
// question-content.ts), so rather than rebuilding seven bespoke content
// viewers just for a read-only page, this shows prompt/explanation/basics
// plus the raw payload/answer as formatted JSON - same "StoredJsonPanel"
// convention the Edit form itself already uses for exactly these fields.
function InfoTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function LocalizedTextCard({ label, value }: { label: string; value: LocalizedText }) {
  return (
    <Card className={GLASS_PANEL}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{label}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        {LANGUAGES.map(({ key, label: langLabel }) => (
          <div key={key} className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{langLabel}</p>
            <p className={value[key] ? "text-sm text-foreground" : "text-sm text-muted-foreground italic"}>
              {value[key] || "Not filled in"}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function QuestionView({ question, topicName }: { question: QuestionRow; topicName: string }) {
  return (
    <div className="space-y-4">
      <Card className={GLASS_PANEL}>
        <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{question.prompt.en || "(untitled)"}</CardTitle>
            <p className="text-sm text-muted-foreground">{question.explanation.en || "No explanation yet"}</p>
          </div>
          <StatusBadge status={question.status}>{question.status}</StatusBadge>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <InfoTile label="Format" value={FORMAT_LABELS[question.format]} />
          <InfoTile label="Topic" value={topicName} />
          <InfoTile label="Status" value={question.status} />
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
        <span>Localized text</span>
      </div>
      <LocalizedTextCard label="Prompt" value={question.prompt} />
      <LocalizedTextCard label="Explanation" value={question.explanation} />

      <details className={GLASS_PANEL}>
        <summary className="flex cursor-pointer select-none items-center gap-2 px-5 py-3 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          <Info className="h-3.5 w-3.5" aria-hidden />
          Payload &amp; answer ({FORMAT_LABELS[question.format]})
        </summary>
        <pre className="overflow-x-auto border-t border-white/50 p-4 text-xs text-foreground">
          {JSON.stringify({ payload: question.payload, answer: question.answer }, null, 2)}
        </pre>
      </details>
    </div>
  );
}
