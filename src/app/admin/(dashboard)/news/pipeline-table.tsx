"use client";

import { Fragment, useState, useTransition } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LocalizedText } from "@/server/shared/schemas";
import {
  updateNewsStoryQualityOverrideAction,
  updateNewsStoryStatusAction,
  updateNewsStoryTopicAction,
} from "./actions";

export type PipelineStoryRow = {
  id: string;
  headline: LocalizedText;
  outlet: string;
  category: string;
  qualityGrade: "A" | "B" | "C";
  qualityGradeOverride: "A" | "B" | "C" | null;
  topicId: string | null;
  status: "draft" | "published" | "hidden";
  adviceLikeWarnings: string[] | null;
  createdAt: Date;
};

const STATUS_LABEL: Record<PipelineStoryRow["status"], string> = {
  draft: "Draft",
  published: "Published",
  hidden: "Hidden",
};

const NO_TOPIC = "__none__";
const NO_OVERRIDE = "__auto__";

function StatusSelect({
  storyId,
  status,
  canPublish,
}: {
  storyId: string;
  status: PipelineStoryRow["status"];
  canPublish: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function change(next: string) {
    startTransition(async () => {
      const result = await updateNewsStoryStatusAction(storyId, next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Story ${STATUS_LABEL[next as PipelineStoryRow["status"]].toLowerCase()}`);
    });
  }

  return (
    <Select value={status} onValueChange={change} disabled={isPending || !canPublish}>
      <SelectTrigger className="w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(STATUS_LABEL) as PipelineStoryRow["status"][]).map((s) => (
          <SelectItem key={s} value={s}>
            {STATUS_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function QualityOverrideSelect({
  storyId,
  qualityGrade,
  qualityGradeOverride,
  canManage,
}: {
  storyId: string;
  qualityGrade: "A" | "B" | "C";
  qualityGradeOverride: "A" | "B" | "C" | null;
  canManage: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function change(next: string) {
    startTransition(async () => {
      const result = await updateNewsStoryQualityOverrideAction(storyId, next === NO_OVERRIDE ? null : next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Quality grade updated");
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <Badge variant="secondary">{qualityGrade}</Badge>
      <Select value={qualityGradeOverride ?? NO_OVERRIDE} onValueChange={change} disabled={isPending || !canManage}>
        <SelectTrigger className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_OVERRIDE}>Auto</SelectItem>
          <SelectItem value="A">A</SelectItem>
          <SelectItem value="B">B</SelectItem>
          <SelectItem value="C">C</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function TopicSelect({
  storyId,
  topicId,
  topics,
  canManage,
}: {
  storyId: string;
  topicId: string | null;
  topics: { id: string; name: LocalizedText }[];
  canManage: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function change(next: string) {
    startTransition(async () => {
      const result = await updateNewsStoryTopicAction(storyId, next === NO_TOPIC ? null : next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Topic updated");
    });
  }

  return (
    <Select value={topicId ?? NO_TOPIC} onValueChange={change} disabled={isPending || !canManage}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_TOPIC}>No topic</SelectItem>
        {topics.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name.en}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PipelineTable({
  stories,
  topics,
  canManage,
  canPublish,
}: {
  stories: PipelineStoryRow[];
  topics: { id: string; name: LocalizedText }[];
  canManage: boolean;
  canPublish: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (stories.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        No stories ingested yet. The ingestion and drafting jobs run on a schedule (or trigger them
        manually via the Inngest dev server).
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Today&apos;s pipeline</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Headline</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Grade</TableHead>
            <TableHead>Topic</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stories.map((story) => (
            <Fragment key={story.id}>
              <TableRow>
                <TableCell className="max-w-72">
                  <button
                    type="button"
                    className="text-left text-sm font-medium text-foreground hover:underline"
                    onClick={() => setExpandedId(expandedId === story.id ? null : story.id)}
                  >
                    {story.headline.en || "(untitled)"}
                  </button>
                  {story.adviceLikeWarnings && story.adviceLikeWarnings.length > 0 && (
                    <p className="mt-1 text-xs text-destructive">
                      Advice-like phrasing: {story.adviceLikeWarnings.join(", ")}
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{story.outlet}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{story.category}</TableCell>
                <TableCell>
                  <QualityOverrideSelect
                    storyId={story.id}
                    qualityGrade={story.qualityGrade}
                    qualityGradeOverride={story.qualityGradeOverride}
                    canManage={canManage}
                  />
                </TableCell>
                <TableCell>
                  <TopicSelect storyId={story.id} topicId={story.topicId} topics={topics} canManage={canManage} />
                </TableCell>
                <TableCell>
                  <StatusSelect storyId={story.id} status={story.status} canPublish={canPublish} />
                </TableCell>
              </TableRow>
              {expandedId === story.id && (
                <TableRow>
                  <TableCell colSpan={6} className="bg-muted/30">
                    <StatusBadge status={story.status}>{STATUS_LABEL[story.status]}</StatusBadge>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Full content is edited via the drafting pipeline output directly in the
                      database today - a rich content editor for this table is a follow-up, not
                      built in Checkpoint 2.
                    </p>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
