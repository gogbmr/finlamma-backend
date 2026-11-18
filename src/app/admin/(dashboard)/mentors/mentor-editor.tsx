"use client";

import { Users } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { MentorsTable } from "./mentors-table";

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
  total,
  page,
  pageCount,
  pageSize,
  q,
  sort,
  dir,
  status,
}: {
  mentors: MentorRow[];
  canManage: boolean;
  canPublish: boolean;
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  q: string;
  sort: string | null;
  dir: "asc" | "desc";
  status: "draft" | "published" | null;
}) {
  const [selectedId, setSelectedId] = useState<string | "new" | null>(mentors[0]?.id ?? "new");
  // Few-line confirm() guard against silently losing an in-progress edit
  // when switching the selected mentor (MentorForm remounts on a `key`
  // change) - same pattern as Worlds (Task 2). Doesn't cover Prev/Next/
  // search/sort/status, which are plain <Link>s - deferred to Task 4.
  const [isDirty, setIsDirty] = useState(false);

  function trySelect(id: string | "new") {
    if (
      isDirty &&
      typeof window !== "undefined" &&
      !window.confirm("Discard unsaved changes to this mentor?")
    ) {
      return;
    }
    setIsDirty(false);
    setSelectedId(id);
  }

  if (total === 0 && !canManage) {
    return (
      <EmptyState
        icon={Users}
        title="No mentors yet"
        description="A staff member with mentor.manage can create the first one."
      />
    );
  }

  // `mentors` is only the current page - a selection made on a page that's
  // since changed under it falls back to this page's first row.
  const effectiveId: string | "new" =
    selectedId === "new" || mentors.some((m) => m.id === selectedId)
      ? (selectedId as string | "new")
      : mentors[0]?.id ?? "new";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Select a mentor below to edit it.</p>
        {canManage && (
          <Button type="button" size="sm" onClick={() => trySelect("new")}>
            + New mentor
          </Button>
        )}
      </div>

      <MentorsTable
        rows={mentors.map((m) => ({ id: m.id, key: m.key, order: m.order, name: m.name, status: m.status }))}
        total={total}
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        q={q}
        sort={sort}
        dir={dir}
        status={status}
        selectedId={effectiveId}
        onSelect={trySelect}
      />

      {effectiveId === "new" && canManage ? (
        <NewMentorForm onDirtyChange={setIsDirty} />
      ) : (
        (() => {
          const mentor = mentors.find((m) => m.id === effectiveId);
          if (!mentor) return null;
          return (
            <MentorForm
              key={mentor.id}
              mentor={mentor}
              canManage={canManage}
              canPublish={canPublish}
              onDirtyChange={setIsDirty}
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

function NewMentorForm({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const [isPending, startTransition] = useTransition();
  const [key, setKey] = useState("");
  const [order, setOrder] = useState("");
  const [persona, setPersona] = useState("");
  const [name, setName] = useState<LocalizedText>(EMPTY_LOCALIZED);
  const [bio, setBio] = useState<LocalizedText>(EMPTY_LOCALIZED);

  // Derived from this form's own empty baseline - see WorldEditor's
  // NewWorldForm for why this is simpler/safer than an effect that fires
  // on every keystroke and has to be manually "un-dirtied" after save.
  const dirty =
    key !== "" ||
    order !== "" ||
    persona !== "" ||
    LANGUAGES.some((l) => name[l] !== "") ||
    LANGUAGES.some((l) => bio[l] !== "");

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

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
  onDirtyChange,
}: {
  mentor: MentorRow;
  canManage: boolean;
  canPublish: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [order, setOrder] = useState(String(mentor.order));
  const [persona, setPersona] = useState(mentor.persona);
  const [name, setName] = useState<LocalizedText>(mentor.name);
  const [bio, setBio] = useState<LocalizedText>(mentor.bio);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The "pristine" baseline to compare against - moves forward after each
  // successful save, since `mentor` itself stays stale (see Worlds'
  // WorldForm for why comparing against the prop directly false-positives
  // "still dirty" right after a successful save).
  const [savedSnapshot, setSavedSnapshot] = useState({
    order: String(mentor.order),
    persona: mentor.persona,
    name: mentor.name,
    bio: mentor.bio,
  });

  const dirty =
    order !== savedSnapshot.order ||
    persona !== savedSnapshot.persona ||
    LANGUAGES.some((l) => name[l] !== savedSnapshot.name[l]) ||
    LANGUAGES.some((l) => bio[l] !== savedSnapshot.bio[l]);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

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
      setSavedSnapshot({ order, persona, name, bio });
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
      setSavedSnapshot((prev) => ({ ...prev, name, bio }));
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
