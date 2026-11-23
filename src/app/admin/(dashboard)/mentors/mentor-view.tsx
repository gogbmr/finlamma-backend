import { Link2, MessageSquareText } from "lucide-react";
import { StatusBadge } from "@/components/admin/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LocalizedText } from "@/server/shared/schemas";
import type { MentorRow, UsedByWorld } from "./mentor-editor";

const LANGUAGES = [
  { key: "en", label: "English" },
  { key: "hi", label: "Hindi" },
  { key: "hx", label: "Hinglish" },
] as const;

// Read-only summary for a mentor - deliberately not a disabled form (the
// Edit page is for that).
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

export function MentorView({ mentor }: { mentor: MentorRow }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
          <div className="flex items-start gap-3">
            {mentor.artUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset
              <img
                src={mentor.artUrl}
                alt=""
                className="h-14 w-14 rounded-full border border-border object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-border bg-muted/30 text-xs text-muted-foreground">
                No art
              </div>
            )}
            <div className="space-y-1">
              <CardTitle className="text-base">{mentor.name.en || "(untitled)"}</CardTitle>
              <p className="font-mono text-xs text-muted-foreground">{mentor.key}</p>
            </div>
          </div>
          <StatusBadge status={mentor.status}>{mentor.status}</StatusBadge>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <InfoTile label="Display order" value={mentor.order} />
          <InfoTile label="Key" value={<span className="font-mono text-xs">{mentor.key}</span>} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2 pb-2">
          <MessageSquareText className="h-4 w-4 text-muted-foreground" aria-hidden />
          <CardTitle className="text-sm">Persona / voice notes (Doubt Zone AI chat)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={mentor.persona ? "text-sm text-foreground" : "text-sm text-muted-foreground italic"}>
            {mentor.persona || "Not filled in"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2 pb-2">
          <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden />
          <CardTitle className="text-sm">Relations</CardTitle>
        </CardHeader>
        <CardContent>
          {mentor.usedByWorlds.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not assigned to any world yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {mentor.usedByWorlds.map((w: UsedByWorld) => (
                <li key={w.id} className="flex items-center gap-2 text-sm">
                  <span className="text-foreground">{w.title.en || "(untitled)"}</span>
                  <StatusBadge status={w.status}>{w.status}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Localized text</span>
      </div>
      <LocalizedTextCard label="Name" value={mentor.name} />
      <LocalizedTextCard label="Bio" value={mentor.bio} />
    </div>
  );
}
