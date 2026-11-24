import { Info } from "lucide-react";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GLASS_PANEL, GlassIconChip } from "@/components/admin/glass";
import type { LocalizedText } from "@/server/shared/schemas";

const LANGUAGES = [
  { key: "en", label: "English" },
  { key: "hi", label: "Hindi" },
  { key: "hx", label: "Hinglish" },
] as const;

export type NewsStoryDetail = {
  id: string;
  category: string;
  impact: "good" | "bad" | "neutral";
  content: { headline: LocalizedText; summary: LocalizedText; body: LocalizedText[] };
  jargon: { term: LocalizedText; explanation: LocalizedText } | null;
  outlet: string;
  sourceUrl: string;
  qualityGrade: "A" | "B" | "C";
  qualityGradeOverride: "A" | "B" | "C" | null;
  featured: boolean;
  adviceLikeWarnings: string[] | null;
  status: "draft" | "published" | "hidden";
  topicName: string;
  publishedAt: Date | null;
};

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

// Read-only - there is deliberately no edit form here (pipeline-table.tsx's
// own comment: a rich content editor for a story's body is a follow-up,
// not built yet). Status/topic/quality-grade-override stay editable only
// via the inline Selects in the pipeline table itself, same as before this
// page existed; this just replaces the old click-to-expand placeholder row
// with a real page showing the story's full drafted content.
export function NewsView({ story }: { story: NewsStoryDetail }) {
  return (
    <div className="space-y-4">
      <Card className={GLASS_PANEL}>
        <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{story.content.headline.en || "(untitled)"}</CardTitle>
            <p className="text-sm text-muted-foreground">{story.content.summary.en || "No summary yet"}</p>
          </div>
          <StatusBadge status={story.status}>{story.status}</StatusBadge>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <InfoTile label="Outlet" value={story.outlet} />
          <InfoTile label="Category" value={story.category} />
          <InfoTile label="Topic" value={story.topicName} />
          <InfoTile label="Impact" value={story.impact} />
          <InfoTile
            label="Quality grade"
            value={
              <span className="flex items-center gap-1.5">
                <Badge variant="secondary">{story.qualityGrade}</Badge>
                {story.qualityGradeOverride && (
                  <span className="text-xs text-muted-foreground">
                    (staff override: {story.qualityGradeOverride})
                  </span>
                )}
              </span>
            }
          />
          <InfoTile label="Featured" value={story.featured ? "Yes" : "No"} />
          <InfoTile
            label="Source"
            value={
              <a
                href={story.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-foreground underline"
              >
                Original article
              </a>
            }
          />
          <InfoTile
            label="Published"
            value={
              story.publishedAt
                ? story.publishedAt.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })
                : "—"
            }
          />
        </CardContent>
      </Card>

      {story.adviceLikeWarnings && story.adviceLikeWarnings.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <p className="font-medium">Advice-like phrasing flagged:</p>
          <ul className="ml-4 list-disc">
            {story.adviceLikeWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <LocalizedTextCard label="Headline" value={story.content.headline} />
      <LocalizedTextCard label="Summary" value={story.content.summary} />
      {story.content.body.map((paragraph, i) => (
        <LocalizedTextCard key={i} label={`Body paragraph ${i + 1}`} value={paragraph} />
      ))}

      {story.jargon && (
        <Card className={GLASS_PANEL}>
          <CardHeader className="flex-row items-center gap-2 pb-2">
            <GlassIconChip icon={Info} className="h-7 w-7 rounded-md" />
            <CardTitle className="text-sm">Jargon callout</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <LocalizedTextCard label="Term" value={story.jargon.term} />
            <LocalizedTextCard label="Explanation" value={story.jargon.explanation} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
