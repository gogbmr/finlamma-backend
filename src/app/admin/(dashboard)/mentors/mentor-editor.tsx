"use client";

import { Users } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
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
import type { LocalizedText } from "@/server/mentors/schemas";
import {
  createMentorDraftAction,
  hotfixMentorAction,
  publishMentorAction,
  unpublishMentorAction,
  updateMentorDraftAction,
  uploadMentorArtAction,
} from "./actions";

type UsedByWorld = { id: string; title: LocalizedText; status: "draft" | "published" };

type MentorRow = {
  id: string;
  key: string;
  order: number;
  name: LocalizedText;
  bio: LocalizedText;
  persona: string;
  status: "draft" | "published";
  artUrl: string | null;
  usedByWorlds: UsedByWorld[];
};

const LANGUAGES = ["en", "hi", "hx"] as const;
const EMPTY_LOCALIZED: LocalizedText = { en: "", hi: "", hx: "" };

export function MentorEditor({
  mentors,
  canManage,
  canPublish,
}: {
  mentors: MentorRow[];
  canManage: boolean;
  canPublish: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | "new" | null>(mentors[0]?.id ?? "new");

  if (mentors.length === 0 && !canManage) {
    return (
      <EmptyState
        icon={Users}
        title="No mentors yet"
        description="A staff member with mentor.manage can create the first one."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select value={selectedId ?? "new"} onValueChange={(v) => setSelectedId(v)}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {mentors.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name.en || m.key} ({m.status})
              </SelectItem>
            ))}
            {canManage && <SelectItem value="new">+ New mentor</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      {selectedId === "new" && canManage ? (
        <NewMentorForm />
      ) : (
        (() => {
          const mentor = mentors.find((m) => m.id === selectedId);
          if (!mentor) return null;
          return (
            <MentorForm
              key={mentor.id}
              mentor={mentor}
              canManage={canManage}
              canPublish={canPublish}
            />
          );
        })()
      )}
    </div>
  );
}

function LocalizedFields({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: LocalizedText;
  onChange: (value: LocalizedText) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
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

function NewMentorForm() {
  const [isPending, startTransition] = useTransition();
  const [key, setKey] = useState("");
  const [order, setOrder] = useState("");
  const [persona, setPersona] = useState("");
  const [name, setName] = useState<LocalizedText>(EMPTY_LOCALIZED);
  const [bio, setBio] = useState<LocalizedText>(EMPTY_LOCALIZED);

  function create() {
    startTransition(async () => {
      const result = await createMentorDraftAction({
        key,
        order: Number(order),
        persona,
        name,
        bio,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Mentor created as a draft");
      setKey("");
      setOrder("");
      setPersona("");
      setName(EMPTY_LOCALIZED);
      setBio(EMPTY_LOCALIZED);
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Key (slug)</Label>
          <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="baby" />
        </div>
        <div className="space-y-1">
          <Label>Display order</Label>
          <Input type="number" value={order} onChange={(e) => setOrder(e.target.value)} />
        </div>
      </div>

      <LocalizedFields label="Name" value={name} onChange={setName} disabled={false} />
      <LocalizedFields label="Bio" value={bio} onChange={setBio} disabled={false} />

      <div className="space-y-1">
        <Label>Persona / voice notes (Doubt Zone AI chat)</Label>
        <Textarea
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          placeholder="e.g. Straightforward and strict, focused on numbers and discipline, no excuses."
        />
      </div>

      <Button type="button" onClick={create} disabled={isPending || !key || !order}>
        Create draft
      </Button>
    </div>
  );
}

function MentorForm({
  mentor,
  canManage,
  canPublish,
}: {
  mentor: MentorRow;
  canManage: boolean;
  canPublish: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [order, setOrder] = useState(String(mentor.order));
  const [persona, setPersona] = useState(mentor.persona);
  const [name, setName] = useState<LocalizedText>(mentor.name);
  const [bio, setBio] = useState<LocalizedText>(mentor.bio);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDraft = mentor.status === "draft";
  const editable = canManage && isDraft;
  // D20 (docs/ARCHITECTURE.md): a published mentor's name/bio can still be
  // hotfixed directly (typo/wording fix), separately from the
  // draft-only structural fields below - requires mentor.publish, the same
  // trust bar as publishing itself.
  const hotfixable = canPublish && !isDraft;
  const nameBioEditable = editable || hotfixable;

  function saveDraft() {
    startTransition(async () => {
      const result = await updateMentorDraftAction({
        id: mentor.id,
        order: Number(order),
        persona,
        name,
        bio,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Draft saved");
    });
  }

  function saveHotfix() {
    startTransition(async () => {
      const result = await hotfixMentorAction({ id: mentor.id, name, bio });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Fix saved - live immediately");
    });
  }

  function publish() {
    startTransition(async () => {
      const result = await publishMentorAction({ id: mentor.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Published");
    });
  }

  function unpublish() {
    startTransition(async () => {
      const result = await unpublishMentorAction({ id: mentor.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Unpublished - back to draft");
    });
  }

  function uploadArt(file: File) {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("id", mentor.id);
      formData.append("file", file);
      const result = await uploadMentorArtAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Art uploaded");
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <StatusBadge status={mentor.status}>{mentor.status}</StatusBadge>
        <span>Key: {mentor.key}</span>
        {!isDraft && (
          <span className="text-xs text-muted-foreground">
            Published - only name/bio can be fixed directly below. Everything else needs unpublish first.
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Display order</Label>
          <Input
            type="number"
            value={order}
            disabled={!editable}
            onChange={(e) => setOrder(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Used by</p>
        {mentor.usedByWorlds.length === 0 ? (
          <p className="text-xs text-muted-foreground">No worlds reference this mentor yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {mentor.usedByWorlds.map((w) => (
              <li key={w.id}>
                <StatusBadge status={w.status}>{w.title.en || "(untitled)"}</StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <LocalizedFields label="Name" value={name} onChange={setName} disabled={!nameBioEditable} />
      <LocalizedFields label="Bio" value={bio} onChange={setBio} disabled={!nameBioEditable} />

      <div className="space-y-1">
        <Label>Persona / voice notes (Doubt Zone AI chat)</Label>
        <Textarea value={persona} disabled={!editable} onChange={(e) => setPersona(e.target.value)} />
      </div>

      <div className="space-y-1">
        <Label>Art</Label>
        {mentor.artUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset
          <img src={mentor.artUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        )}
        {(canManage || canPublish) && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadArt(file);
              }}
            />
            {!isDraft && (
              <p className="text-xs text-muted-foreground">
                This mentor is published - replacing its art requires mentor.publish.
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex gap-2">
        {editable && (
          <Button type="button" variant="outline" onClick={saveDraft} disabled={isPending}>
            Save draft
          </Button>
        )}
        {hotfixable && (
          <Button type="button" variant="outline" onClick={saveHotfix} disabled={isPending}>
            Save fix
          </Button>
        )}
        {canPublish && isDraft && (
          <Button type="button" onClick={publish} disabled={isPending}>
            Publish
          </Button>
        )}
        {canPublish && !isDraft && (
          <Button type="button" variant="outline" onClick={unpublish} disabled={isPending}>
            Unpublish
          </Button>
        )}
      </div>
    </div>
  );
}
