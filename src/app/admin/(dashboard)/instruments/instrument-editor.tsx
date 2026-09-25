"use client";

import { TrendingUp } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { LocalizedText } from "@/server/shared/schemas";
import { createInstrumentAction, updateInstrumentAction } from "./actions";

type InstrumentRow = {
  id: string;
  symbol: string;
  exchange: string;
  name: string;
  sector: string;
  about: LocalizedText;
  tip: LocalizedText;
  tags: string[];
  mcap: number | null;
  pe: number | null;
  lotSize: number;
  active: boolean;
  halted: boolean;
};

const LANGUAGES = ["en", "hi", "hx"] as const;
const EMPTY_LOCALIZED: LocalizedText = { en: "", hi: "", hx: "" };

function LocalizedFields({
  label,
  value,
  onChange,
  disabled,
  helpText,
}: {
  label: string;
  value: LocalizedText;
  onChange: (value: LocalizedText) => void;
  disabled: boolean;
  helpText?: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
      {LANGUAGES.map((lang) => (
        <div key={lang} className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase">{lang}</label>
          <Textarea
            value={value[lang]}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
          />
        </div>
      ))}
    </div>
  );
}

export function InstrumentEditor({
  instruments,
  canManage,
}: {
  instruments: InstrumentRow[];
  canManage: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | "new" | null>(instruments[0]?.id ?? "new");

  if (instruments.length === 0 && !canManage) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No instruments yet"
        description="A staff member with instrument.manage can add the first one."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Select value={selectedId ?? "new"} onValueChange={(v) => setSelectedId(v)}>
        <SelectTrigger className="w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {instruments.map((i) => (
            <SelectItem key={i.id} value={i.id}>
              {i.symbol} - {i.name} {i.active ? "" : "(inactive)"}
            </SelectItem>
          ))}
          {canManage && <SelectItem value="new">+ New instrument</SelectItem>}
        </SelectContent>
      </Select>

      {selectedId === "new" && canManage ? (
        <NewInstrumentForm />
      ) : (
        (() => {
          const instrument = instruments.find((i) => i.id === selectedId);
          if (!instrument) return null;
          return <InstrumentForm key={instrument.id} instrument={instrument} canManage={canManage} />;
        })()
      )}
    </div>
  );
}

function NewInstrumentForm() {
  const [isPending, startTransition] = useTransition();
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [tags, setTags] = useState("");
  const [lotSize, setLotSize] = useState("1");
  const [about, setAbout] = useState<LocalizedText>(EMPTY_LOCALIZED);
  const [tip, setTip] = useState<LocalizedText>(EMPTY_LOCALIZED);

  function create() {
    startTransition(async () => {
      const result = await createInstrumentAction({
        symbol: symbol.toUpperCase(),
        name,
        sector,
        about,
        tip,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        mcap: null,
        pe: null,
        lotSize: Number(lotSize),
        active: true,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Instrument created");
      setSymbol("");
      setName("");
      setSector("");
      setTags("");
      setLotSize("1");
      setAbout(EMPTY_LOCALIZED);
      setTip(EMPTY_LOCALIZED);
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Symbol</Label>
          <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="RELIANCE" />
        </div>
        <div className="space-y-1">
          <Label>Lot size</Label>
          <Input type="number" value={lotSize} onChange={(e) => setLotSize(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Reliance Industries Ltd" />
        </div>
        <div className="space-y-1">
          <Label>Sector</Label>
          <Input value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Oil & Gas" />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Tags (comma-separated)</Label>
        <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="NIFTY 50, Large cap" />
      </div>

      <LocalizedFields label="About" value={about} onChange={setAbout} disabled={false} />
      <LocalizedFields
        label="Tip"
        value={tip}
        onChange={setTip}
        disabled={false}
        helpText="Purely educational - what the company does, or a finance concept it illustrates. Never a buy/sell signal or valuation opinion (CLAUDE.md: never investment advice)."
      />

      <Button type="button" onClick={create} disabled={isPending || !symbol || !name || !sector}>
        Create instrument
      </Button>
    </div>
  );
}

function InstrumentForm({ instrument, canManage }: { instrument: InstrumentRow; canManage: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(instrument.name);
  const [sector, setSector] = useState(instrument.sector);
  const [tags, setTags] = useState(instrument.tags.join(", "));
  const [lotSize, setLotSize] = useState(String(instrument.lotSize));
  const [mcap, setMcap] = useState(instrument.mcap === null ? "" : String(instrument.mcap));
  const [pe, setPe] = useState(instrument.pe === null ? "" : String(instrument.pe));
  const [active, setActive] = useState(instrument.active);
  const [about, setAbout] = useState<LocalizedText>(instrument.about);
  const [tip, setTip] = useState<LocalizedText>(instrument.tip);

  function save() {
    startTransition(async () => {
      const result = await updateInstrumentAction({
        id: instrument.id,
        exchange: instrument.exchange,
        name,
        sector,
        about,
        tip,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        mcap: mcap === "" ? null : Number(mcap),
        pe: pe === "" ? null : Number(pe),
        lotSize: Number(lotSize),
        active,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Saved");
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="font-mono font-medium text-foreground">{instrument.symbol}</span>
        <span>{instrument.exchange}</span>
        {instrument.halted && (
          <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
            HALTED (Ops console)
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Name</Label>
          <Input value={name} disabled={!canManage} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Sector</Label>
          <Input value={sector} disabled={!canManage} onChange={(e) => setSector(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Lot size</Label>
          <Input
            type="number"
            value={lotSize}
            disabled={!canManage}
            onChange={(e) => setLotSize(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Market cap (₹, whole rupees)</Label>
          <Input
            type="number"
            value={mcap}
            disabled={!canManage}
            onChange={(e) => setMcap(e.target.value)}
            placeholder="Not set"
          />
        </div>
        <div className="space-y-1">
          <Label>P/E ratio</Label>
          <Input
            type="number"
            value={pe}
            disabled={!canManage}
            onChange={(e) => setPe(e.target.value)}
            placeholder="Not set"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Tags (comma-separated)</Label>
        <Input value={tags} disabled={!canManage} onChange={(e) => setTags(e.target.value)} />
      </div>

      <LocalizedFields label="About" value={about} onChange={setAbout} disabled={!canManage} />
      <LocalizedFields
        label="Tip"
        value={tip}
        onChange={setTip}
        disabled={!canManage}
        helpText="Purely educational - what the company does, or a finance concept it illustrates. Never a buy/sell signal or valuation opinion (CLAUDE.md: never investment advice)."
      />

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={`active-${instrument.id}`}
          checked={active}
          disabled={!canManage}
          onChange={(e) => setActive(e.target.checked)}
        />
        <label htmlFor={`active-${instrument.id}`} className="text-sm text-foreground">
          Active (shown in the app&apos;s Watchlist/Trade tab)
        </label>
      </div>

      {canManage && (
        <Button type="button" onClick={save} disabled={isPending}>
          Save
        </Button>
      )}
    </div>
  );
}
