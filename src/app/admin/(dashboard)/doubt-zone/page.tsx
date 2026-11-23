import { Flag } from "lucide-react";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { requireStaff } from "@/lib/auth";
import { readDateRangeFilter } from "@/lib/admin/date-range";
import {
  listFlaggedMessagesForAdmin,
  type DoubtMessageFlagCategory,
} from "@/server/doubt-zone/admin-queries";
import { DoubtZoneModerationTable } from "./doubt-zone-moderation-table";

// Task 3b follow-up (approved plan): real-DB pagination replacing the
// 100-row hard cap. listFlaggedMessagesForAdmin (src/server/doubt-zone/
// admin-queries.ts) is a NEW file - the existing listFlaggedMessagesForReview
// is untouched, and nothing here imports requireFullAccess or any other
// part of the app-facing access gate. Fields, the doubt_zone.view
// check below, and every action this page links to are unchanged.
const PAGE_SIZE = 20;

const FLAG_CATEGORIES: DoubtMessageFlagCategory[] = [
  "self_harm_or_suicide",
  "abuse_or_neglect",
  "other_wellbeing_concern",
  "classifier_unavailable",
  "learner_reported",
  "advice_language",
];

function parseFlaggedCategory(raw: string | string[] | undefined): DoubtMessageFlagCategory | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (FLAG_CATEGORIES as readonly string[]).includes(value ?? "")
    ? (value as DoubtMessageFlagCategory)
    : null;
}

function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export default async function DoubtZoneModerationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    await requireStaff("doubt_zone.view");
  } catch {
    return <Forbidden message="You don't have permission to view flagged Doubt Zone messages." />;
  }

  const params = await searchParams;
  const includeReviewed =
    (Array.isArray(params.includeReviewed) ? params.includeReviewed[0] : params.includeReviewed) === "1";
  const flaggedCategoryFilter = parseFlaggedCategory(params.flaggedCategory);
  const { from, to } = readDateRangeFilter(params);
  const page = parsePage(params.page);

  const paged = await listFlaggedMessagesForAdmin({
    page,
    pageSize: PAGE_SIZE,
    includeReviewed,
    flaggedCategory: flaggedCategoryFilter,
    flaggedFrom: from,
    flaggedTo: to,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Doubt Zone" }]}
        icon={Flag}
        title="Doubt Zone moderation"
        description="Flagged Doubt Zone AI messages only - either the safety classifier tripped on a learner message, or a learner reported a reply. Full, unflagged conversations are never browsable here, by anyone. Viewing a flagged message's content is logged."
      />

      <DoubtZoneModerationTable
        rows={paged.rows.map((r) => ({
          id: r.id,
          threadId: r.threadId,
          role: r.role,
          flaggedCategory: r.flaggedCategory,
          createdAt: r.createdAt.toISOString(),
          reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
          displayName: r.lastInitial ? `${r.firstName ?? "—"} ${r.lastInitial}.` : (r.firstName ?? "—"),
          mentorName: r.mentorName.en,
        }))}
        total={paged.total}
        page={paged.page}
        pageCount={paged.pageCount}
        flaggedCategory={flaggedCategoryFilter}
        includeReviewed={includeReviewed}
        from={params.from && !Array.isArray(params.from) ? params.from : ""}
        to={params.to && !Array.isArray(params.to) ? params.to : ""}
      />
    </div>
  );
}
