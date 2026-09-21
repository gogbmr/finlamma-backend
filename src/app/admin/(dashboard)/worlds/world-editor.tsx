"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
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
import {
  createWorldDraftAction,
  publishWorldAction,
  reorderWorldAction,
  unpublishWorldAction,
  updateWorldDraftAction,
  uploadWorldArtAction,
} from "./actions";

type WorldRow = {
  id: string;
  order: number;
  title: LocalizedText;
  tagline: LocalizedText;
  theme: string;
  displayXpTarget: number;
  mentorId: string;
  status: "draft" | "published";
  artUrl: string | null;
};

type MentorOption = { id: string; key: string; name: LocalizedText; status: "draft" | "published" };
type DoubtZoneLessonRef = { id: string; title: LocalizedText; mentorKey: string };

const LANGUAGES = ["en", "hi", "hx"] as const;
const EMPTY_LOCALIZED: LocalizedText = { en: "", hi: "", hx: "" };

export function WorldEditor({
  worlds,
  mentors,
  doubtZoneLessonsByWorldId,
  canManage,
  canPublish,
}: {
  worlds: WorldRow[];
  mentors: MentorOption[];
  doubtZoneLessonsByWorldId: Record<string, DoubtZoneLessonRef[]>;
  canManage: boolean;
  canPublish: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | "new" | null>(worlds[0]?.id ?? "new");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select value={selectedId ?? "new"} onValueChange={(v) => setSelectedId(v)}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {worlds.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.order}. {w.title.en || "(untitled)"} ({w.status})
              </SelectItem>
            ))}
            {canManage && <SelectItem value="new">+ New world</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      {selectedId === "new" && canManage ? (
        <NewWorldForm mentors={mentors} />
      ) : (
        (() => {
          const world = worlds.find((w) => w.id === selectedId);
          if (!world) return null;
          return (
            <WorldForm
              key={world.id}
              world={world}
              mentors={mentors}
              doubtZoneLessons={doubtZoneLessonsByWorldId[world.id] ?? []}
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
      <p className="text-sm font-medium text-neutral-800">{label}</p>
      {LANGUAGES.map((lang) => (
        <div key={lang} className="space-y-1">
          <label className="text-xs font-medium uppercase text-neutral-500">{lang}</label>
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

function MentorSelect({
  mentors,
  value,
  onChange,
  disabled,
}: {
  mentors: MentorOption[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label>Mentor</Label>
      <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Pick a mentor" />
        </SelectTrigger>
        <SelectContent>
          {mentors.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name.en || m.key} ({m.status})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-neutral-500">
        Publishing this world requires the chosen mentor to already be published.
      </p>
    </div>
  );
}

function NewWorldForm({ mentors }: { mentors: MentorOption[] }) {
  const [isPending, startTransition] = useTransition();
  const [order, setOrder] = useState("");
  const [theme, setTheme] = useState("");
  const [displayXpTarget, setDisplayXpTarget] = useState("");
  const [mentorId, setMentorId] = useState("");
  const [title, setTitle] = useState<LocalizedText>(EMPTY_LOCALIZED);
  const [tagline, setTagline] = useState<LocalizedText>(EMPTY_LOCALIZED);

  function create() {
    startTransition(async () => {
      const result = await createWorldDraftAction({
        order: Number(order),
        theme,
        displayXpTarget: Number(displayXpTarget),
        mentorId,
        title,
        tagline,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("World created as a draft");
      setOrder("");
      setTheme("");
      setDisplayXpTarget("");
      setMentorId("");
      setTitle(EMPTY_LOCALIZED);
      setTagline(EMPTY_LOCALIZED);
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Display order</Label>
          <Input type="number" value={order} onChange={(e) => setOrder(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Theme (cosmetic accent color/key)</Label>
          <Input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="#7C3AED" />
        </div>
        <div className="space-y-1">
          <Label>Display XP target (cosmetic only)</Label>
          <Input
            type="number"
            value={displayXpTarget}
            onChange={(e) => setDisplayXpTarget(e.target.value)}
          />
        </div>
        <MentorSelect mentors={mentors} value={mentorId} onChange={setMentorId} disabled={false} />
      </div>

      <LocalizedFields label="Title" value={title} onChange={setTitle} disabled={false} />
      <LocalizedFields label="Tagline" value={tagline} onChange={setTagline} disabled={false} />

      <Button
        type="button"
        onClick={create}
        disabled={isPending || !order || !theme || !displayXpTarget || !mentorId}
      >
        Create draft
      </Button>
    </div>
  );
}

function WorldForm({
  world,
  mentors,
  doubtZoneLessons,
  canManage,
  canPublish,
}: {
  world: WorldRow;
  mentors: MentorOption[];
  doubtZoneLessons: DoubtZoneLessonRef[];
  canManage: boolean;
  canPublish: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [order, setOrder] = useState(String(world.order));
  const [theme, setTheme] = useState(world.theme);
  const [displayXpTarget, setDisplayXpTarget] = useState(String(world.displayXpTarget));
  const [mentorId, setMentorId] = useState(world.mentorId);
  const [title, setTitle] = useState<LocalizedText>(world.title);
  const [tagline, setTagline] = useState<LocalizedText>(world.tagline);
  const [reorderTarget, setReorderTarget] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDraft = world.status === "draft";
  const editable = canManage && isDraft;

  // Changing the mentor away from what it was when this form loaded doesn't
  // retroactively update any Doubt Zone script's own content.mentorKey
  // (fixed at authoring time - see docs/ARCHITECTURE.md D19), so warn with
  // exactly which scripts are now written for a mentor this world is about
  // to stop using, before the change is saved - not just as an editor
  // banner that could be scrolled past.
  const originalMentorKey = mentors.find((m) => m.id === world.mentorId)?.key ?? null;
  const mentorChanged = mentorId !== world.mentorId;
  const affectedDoubtZoneLessons =
    mentorChanged && originalMentorKey
      ? doubtZoneLessons.filter((l) => l.mentorKey === originalMentorKey)
      : [];

  function saveDraft() {
    if (affectedDoubtZoneLessons.length > 0) {
      const titles = affectedDoubtZoneLessons.map((l) => l.title.en || l.id).join(", ");
      const confirmed = window.confirm(
        `Changing the mentor will leave these Doubt Zone lessons scripted for the old mentor: ` +
          `${titles}. Review/update their scripts after saving. Continue?`,
      );
      if (!confirmed) return;
    }
    startTransition(async () => {
      const result = await updateWorldDraftAction({
        id: world.id,
        order: Number(order),
        theme,
        displayXpTarget: Number(displayXpTarget),
        mentorId,
        title,
        tagline,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Draft saved");
    });
  }

  function publish() {
    startTransition(async () => {
      const result = await publishWorldAction({ id: world.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Published");
    });
  }

  function unpublish() {
    startTransition(async () => {
      const result = await unpublishWorldAction({ id: world.id });
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
      formData.append("id", world.id);
      formData.append("file", file);
      const result = await uploadWorldArtAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Art uploaded");
    });
  }

  function reorder() {
    const target = Number(reorderTarget);
    if (!target) return;
    startTransition(async () => {
      const result = await reorderWorldAction({ id: world.id, newOrder: target });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Moved to position ${target}`);
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
        <span
          className={
            world.status === "published"
              ? "rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
              : "rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
          }
        >
          {world.status}
        </span>
        {!isDraft && (
          <span className="text-xs text-neutral-500">
            Published worlds can&apos;t be edited - unpublish first.
          </span>
        )}
      </div>

      {affectedDoubtZoneLessons.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Changing the mentor will leave {affectedDoubtZoneLessons.length} Doubt Zone lesson
          {affectedDoubtZoneLessons.length > 1 ? "s" : ""} scripted for the old mentor (
          {originalMentorKey}):
          <ul className="ml-4 list-disc">
            {affectedDoubtZoneLessons.map((l) => (
              <li key={l.id}>{l.title.en || l.id}</li>
            ))}
          </ul>
          You&apos;ll be asked to confirm again when you save.
        </div>
      )}

      {canManage && (
        <div className="flex items-end gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <div className="space-y-1">
            <Label>Move to position</Label>
            <Input
              type="number"
              className="w-24"
              value={reorderTarget}
              onChange={(e) => setReorderTarget(e.target.value)}
              placeholder={String(world.order)}
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={reorder} disabled={isPending}>
            Move
          </Button>
          <p className="text-xs text-neutral-500">
            Works on published worlds too, and shifts everyone between the old and new position -
            no unpublish needed.
          </p>
        </div>
      )}

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
        <div className="space-y-1">
          <Label>Theme (cosmetic accent color/key)</Label>
          <Input value={theme} disabled={!editable} onChange={(e) => setTheme(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Display XP target (cosmetic only)</Label>
          <Input
            type="number"
            value={displayXpTarget}
            disabled={!editable}
            onChange={(e) => setDisplayXpTarget(e.target.value)}
          />
        </div>
        <MentorSelect mentors={mentors} value={mentorId} onChange={setMentorId} disabled={!editable} />
      </div>

      <LocalizedFields label="Title" value={title} onChange={setTitle} disabled={!editable} />
      <LocalizedFields label="Tagline" value={tagline} onChange={setTagline} disabled={!editable} />

      <div className="space-y-1">
        <Label>Art</Label>
        {world.artUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset
          <img src={world.artUrl} alt="" className="h-16 w-28 rounded object-cover" />
        )}
        {canManage && (
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
        )}
      </div>

      <div className="flex gap-2">
        {editable && (
          <Button type="button" variant="outline" onClick={saveDraft} disabled={isPending}>
            Save draft
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
