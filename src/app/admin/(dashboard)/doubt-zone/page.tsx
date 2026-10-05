import { Flag } from "lucide-react";
import Link from "next/link";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { requireStaff } from "@/lib/auth";
import { listFlaggedMessagesForModeration } from "@/server/doubt-zone/service";
import { DoubtZoneModerationTable } from "./doubt-zone-moderation-table";

export default async function DoubtZoneModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ includeReviewed?: string }>;
}) {
  try {
    await requireStaff("doubt_zone.moderate");
  } catch {
    return <Forbidden message="You don't have permission to view flagged Doubt Zone messages." />;
  }

  const params = await searchParams;
  const includeReviewed = params.includeReviewed === "1";

  const rows = await listFlaggedMessagesForModeration({ includeReviewed, limit: 100 });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin/staff" }, { label: "Doubt Zone" }]}
        icon={Flag}
        title="Doubt Zone moderation"
        description="Flagged Doubt Zone AI messages only - either the safety classifier tripped on a learner message, or a learner reported a reply. Full, unflagged conversations are never browsable here, by anyone. Viewing a flagged message's content is logged."
      />

      <Link
        href={includeReviewed ? "/admin/doubt-zone" : "/admin/doubt-zone?includeReviewed=1"}
        className="text-sm font-medium underline"
      >
        {includeReviewed ? "Hide reviewed" : "Show reviewed"}
      </Link>

      <DoubtZoneModerationTable
        rows={rows.map((r) => ({
          id: r.id,
          threadId: r.threadId,
          role: r.role,
          flaggedCategory: r.flaggedCategory,
          createdAt: r.createdAt.toISOString(),
          reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
          displayName: r.lastInitial ? `${r.firstName ?? "—"} ${r.lastInitial}.` : (r.firstName ?? "—"),
          mentorName: r.mentorName.en,
        }))}
      />
    </div>
  );
}
