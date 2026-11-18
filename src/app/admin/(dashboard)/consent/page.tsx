import { ShieldCheck } from "lucide-react";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { requireStaff } from "@/lib/auth";
import { readDateRangeFilter } from "@/lib/admin/date-range";
import { roleHasPermission } from "@/server/staff/repo";
import { listConsentRecordsForAdmin, type ConsentStatusFilter } from "@/server/onboarding/admin-queries";
import { ConsentReviewTable } from "./consent-review-table";
import { DobCorrectionForm } from "./dob-correction-form";

// Task 3b follow-up (approved plan): real-DB pagination replacing the
// 100-row hard cap. listConsentRecordsForAdmin (src/server/onboarding/
// admin-queries.ts) is a NEW file - the existing listConsentRecordsForReview
// is untouched, and nothing here imports requireFullAccess or any other
// part of the app-facing consent gate. Fields, the consent.view/
// consent.correct_dob checks below, and every action this page links to
// are unchanged.
const PAGE_SIZE = 20;

function parseStatusFilter(raw: string | string[] | undefined): ConsentStatusFilter | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "pending" || value === "consented" || value === "refused" || value === "withdrawn"
    ? value
    : null;
}

function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export default async function ConsentReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let staff;
  try {
    staff = await requireStaff("consent.view");
  } catch {
    return <Forbidden message="You don't have permission to view parental consent status." />;
  }

  const params = await searchParams;
  const includeDeleted = (Array.isArray(params.includeDeleted) ? params.includeDeleted[0] : params.includeDeleted) === "1";
  const statusFilter = parseStatusFilter(params.status);
  const { from, to } = readDateRangeFilter(params);
  const page = parsePage(params.page);

  // consent.correct_dob is super_admin only (app asks batch, section C3) -
  // hidden here for everyone else, but the server action re-checks it
  // itself regardless (admin-page skill rule 2: never rely on hiding alone).
  const canCorrectDob = await roleHasPermission(staff.roleId, "consent.correct_dob");

  const paged = await listConsentRecordsForAdmin({
    page,
    pageSize: PAGE_SIZE,
    status: statusFilter,
    includeDeleted,
    requestedFrom: from,
    requestedTo: to,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Consent" }]}
        icon={ShieldCheck}
        title="Parental consent"
        description="Read-only status for every under-18 account's parental-consent request. This view cannot approve, deny or bypass consent - only the parent can, via their emailed link. Parent contact details are hidden by default; viewing them is logged. Deleted accounts are hidden by default and their contact details are never revealable."
      />

      {canCorrectDob && <DobCorrectionForm />}

      <ConsentReviewTable
        rows={paged.rows.map((r) => ({
          userId: r.userId,
          displayName: r.lastInitial ? `${r.firstName ?? "—"} ${r.lastInitial}.` : (r.firstName ?? "—"),
          status: r.status,
          requestedAt: r.createdAt.toISOString(),
          actedAt: r.actedAt ? r.actedAt.toISOString() : null,
          deleted: r.deletedAt !== null,
        }))}
        total={paged.total}
        page={paged.page}
        pageCount={paged.pageCount}
        status={statusFilter}
        includeDeleted={includeDeleted}
        from={params.from && !Array.isArray(params.from) ? params.from : ""}
        to={params.to && !Array.isArray(params.to) ? params.to : ""}
      />
    </div>
  );
}
