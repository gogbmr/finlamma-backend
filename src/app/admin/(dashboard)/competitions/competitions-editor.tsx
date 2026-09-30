"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { LocalizedText } from "@/server/shared/schemas";
import {
  createCompetitionDraftAction,
  publishCompetitionAction,
  updateCompetitionDraftAction,
  updateCompetitionSettingsAction,
} from "./actions";

type PrizeBand = { rankFrom: number; rankTo: number; vmAmount: number; badgeId: string | null };

type CompetitionRow = {
  id: string;
  name: LocalizedText;
  instrumentId: string;
  virtualCapitalPaise: number;
  windowStart: string; // ISO
  windowEnd: string; // ISO
  prizes: PrizeBand[];
  rules: LocalizedText;
  status: "draft" | "published";
};

type InstrumentOption = { id: string; symbol: string; name: string };
type BadgeOption = { id: string; name: LocalizedText };

const BLANK_TEXT: LocalizedText = { en: "", hi: "", hx: "" };
// D58's reduced defaults - a fixed 3-band structure, admin edits the
// amounts/badges, not the band shape itself.
const DEFAULT_PRIZES: PrizeBand[] = [
  { rankFrom: 1, rankTo: 1, vmAmount: 5000, badgeId: null },
  { rankFrom: 2, rankTo: 3, vmAmount: 2000, badgeId: null },
  { rankFrom: 4, rankTo: 10, vmAmount: 500, badgeId: null },
];

function toDatetimeLocal(iso: string): string {
  return iso.slice(0, 16); // "2026-10-01T00:00:00.000Z" -> "2026-10-01T00:00"
}

function TextInputs({ value, onChange, label }: { value: LocalizedText; onChange: (v: LocalizedText) => void; label: string }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input placeholder="English" value={value.en} onChange={(e) => onChange({ ...value, en: e.target.value })} />
        <Input placeholder="Hindi" value={value.hi} onChange={(e) => onChange({ ...value, hi: e.target.value })} />
        <Input placeholder="Hinglish" value={value.hx} onChange={(e) => onChange({ ...value, hx: e.target.value })} />
      </div>
    </div>
  );
}

function RulesTextareas({ value, onChange }: { value: LocalizedText; onChange: (v: LocalizedText) => void }) {
  return (
    <div className="space-y-1">
      <Label>Rules text</Label>
      <Textarea placeholder="English" value={value.en} onChange={(e) => onChange({ ...value, en: e.target.value })} />
      <Textarea placeholder="Hindi" value={value.hi} onChange={(e) => onChange({ ...value, hi: e.target.value })} />
      <Textarea placeholder="Hinglish" value={value.hx} onChange={(e) => onChange({ ...value, hx: e.target.value })} />
    </div>
  );
}

function PrizeBandRow({
  band,
  label,
  badges,
  onChange,
}: {
  band: PrizeBand;
  label: string;
  badges: BadgeOption[];
  onChange: (b: PrizeBand) => void;
}) {
  return (
    <div className="flex items-end gap-3 rounded-md border border-border p-3">
      <div className="w-20 text-sm font-medium text-foreground">{label}</div>
      <div className="space-y-1">
        <Label>VM amount</Label>
        <Input type="number" value={band.vmAmount} onChange={(e) => onChange({ ...band, vmAmount: Number(e.target.value) })} />
      </div>
      <div className="space-y-1">
        <Label>Badge</Label>
        <Select value={band.badgeId ?? "none"} onValueChange={(v) => onChange({ ...band, badgeId: v === "none" ? null : v })}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {badges.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name.en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function CompetitionForm({
  competition,
  instruments,
  badges,
  onSaved,
}: {
  competition: CompetitionRow | null;
  instruments: InstrumentOption[];
  badges: BadgeOption[];
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState<LocalizedText>(competition?.name ?? BLANK_TEXT);
  const [instrumentId, setInstrumentId] = useState(competition?.instrumentId ?? instruments[0]?.id ?? "");
  const [capitalRupees, setCapitalRupees] = useState(competition ? competition.virtualCapitalPaise / 100 : 100000);
  const [windowStart, setWindowStart] = useState(competition ? toDatetimeLocal(competition.windowStart) : "");
  const [windowEnd, setWindowEnd] = useState(competition ? toDatetimeLocal(competition.windowEnd) : "");
  const [prizes, setPrizes] = useState<PrizeBand[]>(competition?.prizes ?? DEFAULT_PRIZES);
  const [rules, setRules] = useState<LocalizedText>(competition?.rules ?? BLANK_TEXT);

  function save() {
    startTransition(async () => {
      const input = {
        name,
        instrumentId,
        virtualCapitalPaise: Math.round(capitalRupees * 100),
        windowStart,
        windowEnd,
        prizes,
        rules,
      };
      const result = competition
        ? await updateCompetitionDraftAction(competition.id, input)
        : await createCompetitionDraftAction(input);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(competition ? "Competition updated" : "Competition created");
      onSaved();
    });
  }

  function publish() {
    if (!competition) return;
    startTransition(async () => {
      const result = await publishCompetitionAction(competition.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Competition published");
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <TextInputs label="Name" value={name} onChange={setName} />

      <div className="space-y-1">
        <Label>Instrument</Label>
        <Select value={instrumentId} onValueChange={setInstrumentId}>
          <SelectTrigger className="w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {instruments.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.symbol} - {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label>Virtual capital (₹)</Label>
          <Input type="number" value={capitalRupees} onChange={(e) => setCapitalRupees(Number(e.target.value))} />
          <p className="text-xs text-muted-foreground">A sandbox balance - never V Money (D57).</p>
        </div>
        <div className="space-y-1">
          <Label>Window start</Label>
          <Input type="datetime-local" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Window end</Label>
          <Input type="datetime-local" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Prizes (D58 - all admin-editable)</Label>
        <PrizeBandRow label="1st" band={prizes[0]!} badges={badges} onChange={(b) => setPrizes([b, prizes[1]!, prizes[2]!])} />
        <PrizeBandRow label="2nd-3rd" band={prizes[1]!} badges={badges} onChange={(b) => setPrizes([prizes[0]!, b, prizes[2]!])} />
        <PrizeBandRow label="4th-10th" band={prizes[2]!} badges={badges} onChange={(b) => setPrizes([prizes[0]!, prizes[1]!, b])} />
      </div>

      <RulesTextareas value={rules} onChange={setRules} />

      <div className="flex gap-2">
        <Button type="button" onClick={save} disabled={isPending}>
          {competition ? "Save" : "Create draft"}
        </Button>
        {competition?.status === "draft" && (
          <Button type="button" variant="outline" onClick={publish} disabled={isPending}>
            Publish
          </Button>
        )}
      </div>
    </div>
  );
}

type SettingsValue = { minQualifyingTrades: number; maxTrades: number; entryWindowPct: number };

function SettingsPanel({ initial }: { initial: SettingsValue }) {
  const [isPending, startTransition] = useTransition();
  const [settings, setSettings] = useState<SettingsValue>(initial);

  function save() {
    startTransition(async () => {
      const result = await updateCompetitionSettingsAction(settings);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Settings updated");
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">Settings</h2>
        <p className="text-xs text-muted-foreground">
          Apply to every competition. D59: entries close after the window&apos;s first N%, and an entry
          needs at least the minimum trades to qualify for ranking/prizes at settlement.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label>Min qualifying trades</Label>
          <Input
            type="number"
            value={settings.minQualifyingTrades}
            onChange={(e) => setSettings({ ...settings, minQualifyingTrades: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label>Max trades per entry</Label>
          <Input
            type="number"
            value={settings.maxTrades}
            onChange={(e) => setSettings({ ...settings, maxTrades: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label>Entry window (% of competition length)</Label>
          <Input
            type="number"
            value={settings.entryWindowPct}
            onChange={(e) => setSettings({ ...settings, entryWindowPct: Number(e.target.value) })}
          />
        </div>
      </div>
      <Button type="button" onClick={save} disabled={isPending}>
        Save settings
      </Button>
    </div>
  );
}

export function CompetitionsEditor({
  competitions,
  instruments,
  badges,
  settings,
}: {
  competitions: CompetitionRow[];
  instruments: InstrumentOption[];
  badges: BadgeOption[];
  settings: SettingsValue;
}) {
  const [selectedId, setSelectedId] = useState<string | "new">(competitions[0]?.id ?? "new");
  const selected = competitions.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Monthly Competition</h2>
          <p className="text-xs text-muted-foreground">
            Virtual capital never touches V Money (docs/ARCHITECTURE.md D57) - only the prize at
            settlement does. Entries are only accepted in the first part of the window and need a
            minimum number of trades to qualify for a prize (D59, see settings below).
          </p>
        </div>

        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="w-96">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {competitions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name.en} ({c.status})
              </SelectItem>
            ))}
            <SelectItem value="new">+ New competition</SelectItem>
          </SelectContent>
        </Select>

        <CompetitionForm
          key={selectedId}
          competition={selected}
          instruments={instruments}
          badges={badges}
          onSaved={() => setSelectedId("new")}
        />
      </div>

      <SettingsPanel initial={settings} />
    </div>
  );
}
