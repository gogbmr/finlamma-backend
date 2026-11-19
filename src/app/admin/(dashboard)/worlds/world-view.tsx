import { Images, Info, Link2, Type } from "lucide-react";
import { StatusBadge } from "@/components/admin/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LocalizedText } from "@/server/shared/schemas";
import type { MentorOption, WorldRow } from "./world-editor";

const LANGUAGES = [
  { key: "en", label: "English" },
  { key: "hi", label: "Hindi" },
  { key: "hx", label: "Hinglish" },
] as const;

// Read-only summary for a world - deliberately not a disabled form (that's
// what the Edit page is for). Same data WorldForm edits, laid out as a
// clean at-a-glance view: a staff member checking a world's current state
// shouldn't have to parse a greyed-out form to find it.
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

export function WorldView({ world, mentor }: { world: WorldRow; mentor: MentorOption | null }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <span
                className="h-4 w-4 rounded-full border border-border"
                style={{ backgroundColor: world.theme || "transparent" }}
                aria-hidden
              />
              {world.title.en || "(untitled)"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{world.tagline.en || "No tagline yet"}</p>
          </div>
          <StatusBadge status={world.status}>{world.status}</StatusBadge>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <InfoTile label="Display order" value={world.order} />
          <InfoTile label="Certificate code" value={world.code ?? "—"} />
          <InfoTile label="Display XP target" value={world.displayXpTarget} />
          <InfoTile
            label="Theme"
            value={
              <span className="flex items-center gap-1.5 font-mono text-xs">
                <span
                  className="h-3.5 w-3.5 rounded-sm border border-border"
                  style={{ backgroundColor: world.theme || "transparent" }}
                  aria-hidden
                />
                {world.theme || "—"}
              </span>
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2 pb-2">
          <Images className="h-4 w-4 text-muted-foreground" aria-hidden />
          <CardTitle className="text-sm">Art</CardTitle>
        </CardHeader>
        <CardContent>
          {world.artUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset
            <img
              src={world.artUrl}
              alt=""
              className="h-32 w-56 rounded-lg border border-border object-cover shadow-sm"
            />
          ) : (
            <div className="flex h-32 w-56 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-xs text-muted-foreground">
              No art yet
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2 pb-2">
          <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden />
          <CardTitle className="text-sm">Relations</CardTitle>
        </CardHeader>
        <CardContent>
          {mentor ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-foreground">{mentor.name.en || mentor.key}</span>
              <StatusBadge status={mentor.status}>{mentor.status}</StatusBadge>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No mentor assigned.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Type className="h-3.5 w-3.5" aria-hidden />
        <span>Localized text</span>
      </div>
      <LocalizedTextCard label="Title" value={world.title} />
      <LocalizedTextCard label="Tagline" value={world.tagline} />

      <details className="rounded-xl border border-border bg-card">
        <summary className="flex cursor-pointer select-none items-center gap-2 px-5 py-3 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          <Info className="h-3.5 w-3.5" aria-hidden />
          Advanced: view stored JSON
        </summary>
        <pre className="overflow-x-auto border-t border-border bg-muted/30 p-4 text-xs text-foreground">
          {JSON.stringify(world, null, 2)}
        </pre>
      </details>
    </div>
  );
}
