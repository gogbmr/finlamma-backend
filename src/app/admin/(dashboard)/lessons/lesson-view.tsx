import { Info, Type } from "lucide-react";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LocalizedText } from "@/server/shared/schemas";
import { KIND_LABELS } from "./lessons-table";
import type { LessonRow } from "./lesson-editor";

const LANGUAGES = [
  { key: "en", label: "English" },
  { key: "hi", label: "Hindi" },
  { key: "hx", label: "Hinglish" },
] as const;

// Read-only summary for a lesson - deliberately not a disabled form (the
// Edit page is for that). Content varies a lot by kind (video/story/quiz/
// boss_quiz/role_play/doubt_zone, each with its own shape - see
// lesson-content.ts), so rather than rebuilding six bespoke content
// viewers just for a read-only page, this shows title/blurb/basics plus
// the raw content as formatted JSON - same "Advanced: view stored JSON"
// convention the Edit form itself already uses for exactly this field.
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
    <Card>
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

export function LessonView({ lesson, worldTitle }: { lesson: LessonRow; worldTitle: LocalizedText }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{lesson.title.en || "(untitled)"}</CardTitle>
            <p className="text-sm text-muted-foreground">{lesson.blurb.en || "No blurb yet"}</p>
          </div>
          <StatusBadge status={lesson.status}>{lesson.status}</StatusBadge>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <InfoTile label="World" value={worldTitle.en || "(untitled)"} />
          <InfoTile label="Chapter . Step" value={`${lesson.chapter}.${lesson.step}`} />
          <InfoTile label="Kind" value={KIND_LABELS[lesson.kind] ?? lesson.kind} />
          <InfoTile
            label="In progress"
            value={
              lesson.inProgressLearnerCount > 0 ? (
                <Badge variant="info">{lesson.inProgressLearnerCount} learner(s)</Badge>
              ) : (
                "—"
              )
            }
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Type className="h-3.5 w-3.5" aria-hidden />
        <span>Localized text</span>
      </div>
      <LocalizedTextCard label="Title" value={lesson.title} />
      <LocalizedTextCard label="Blurb" value={lesson.blurb} />

      <details className="rounded-xl border border-border bg-card">
        <summary className="flex cursor-pointer select-none items-center gap-2 px-5 py-3 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          <Info className="h-3.5 w-3.5" aria-hidden />
          Content ({KIND_LABELS[lesson.kind] ?? lesson.kind})
        </summary>
        <pre className="overflow-x-auto border-t border-border bg-muted/30 p-4 text-xs text-foreground">
          {JSON.stringify(lesson.content, null, 2)}
        </pre>
      </details>
    </div>
  );
}
