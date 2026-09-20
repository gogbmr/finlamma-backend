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
import type { LocalizedText } from "@/server/mentors/schemas";
import {
  createMentorDraftAction,
  publishMentorAction,
  unpublishMentorAction,
  updateMentorDraftAction,
  uploadMentorArtAction,
} from "./actions";

type MentorRow = {
  id: string;
  key: string;
  order: number;
  name: LocalizedText;
  bio: LocalizedText;
  worldRangeStart: number;
  worldRangeEnd: number | null;
  status: "draft" | "published";
  artUrl: string | null;
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

function NewMentorForm() {
  const [isPending, startTransition] = useTransition();
  const [key, setKey] = useState("");
  const [order, setOrder] = useState("");
  const [worldRangeStart, setWorldRangeStart] = useState("");
  const [worldRangeEnd, setWorldRangeEnd] = useState("");
  const [name, setName] = useState<LocalizedText>(EMPTY_LOCALIZED);
  const [bio, setBio] = useState<LocalizedText>(EMPTY_LOCALIZED);

  function create() {
    startTransition(async () => {
      const result = await createMentorDraftAction({
        key,
        order: Number(order),
        worldRangeStart: Number(worldRangeStart),
        worldRangeEnd: worldRangeEnd ? Number(worldRangeEnd) : null,
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
      setWorldRangeStart("");
      setWorldRangeEnd("");
      setName(EMPTY_LOCALIZED);
      setBio(EMPTY_LOCALIZED);
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Key (slug)</Label>
          <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="baby" />
        </div>
        <div className="space-y-1">
          <Label>Display order</Label>
          <Input type="number" value={order} onChange={(e) => setOrder(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>World range start</Label>
          <Input
            type="number"
            value={worldRangeStart}
            onChange={(e) => setWorldRangeStart(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>World range end (blank = open-ended)</Label>
          <Input
            type="number"
            value={worldRangeEnd}
            onChange={(e) => setWorldRangeEnd(e.target.value)}
          />
        </div>
      </div>

      <LocalizedFields label="Name" value={name} onChange={setName} disabled={false} />
      <LocalizedFields label="Bio" value={bio} onChange={setBio} disabled={false} />

      <Button
        type="button"
        onClick={create}
        disabled={isPending || !key || !order || !worldRangeStart}
      >
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
  const [worldRangeStart, setWorldRangeStart] = useState(String(mentor.worldRangeStart));
  const [worldRangeEnd, setWorldRangeEnd] = useState(
    mentor.worldRangeEnd === null ? "" : String(mentor.worldRangeEnd),
  );
  const [name, setName] = useState<LocalizedText>(mentor.name);
  const [bio, setBio] = useState<LocalizedText>(mentor.bio);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDraft = mentor.status === "draft";
  const editable = canManage && isDraft;

  function saveDraft() {
    startTransition(async () => {
      const result = await updateMentorDraftAction({
        id: mentor.id,
        order: Number(order),
        worldRangeStart: Number(worldRangeStart),
        worldRangeEnd: worldRangeEnd ? Number(worldRangeEnd) : null,
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
    <div className="space-y-4 rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
        <span
          className={
            mentor.status === "published"
              ? "rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
              : "rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
          }
        >
          {mentor.status}
        </span>
        <span>Key: {mentor.key}</span>
        {!isDraft && (
          <span className="text-xs text-neutral-500">
            Published mentors can&apos;t be edited - unpublish first.
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
        <div />
        <div className="space-y-1">
          <Label>World range start</Label>
          <Input
            type="number"
            value={worldRangeStart}
            disabled={!editable}
            onChange={(e) => setWorldRangeStart(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>World range end (blank = open-ended)</Label>
          <Input
            type="number"
            value={worldRangeEnd}
            disabled={!editable}
            onChange={(e) => setWorldRangeEnd(e.target.value)}
          />
        </div>
      </div>

      <LocalizedFields label="Name" value={name} onChange={setName} disabled={!editable} />
      <LocalizedFields label="Bio" value={bio} onChange={setBio} disabled={!editable} />

      <div className="space-y-1">
        <Label>Art</Label>
        {mentor.artUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset
          <img src={mentor.artUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        )}
        {canManage && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
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
